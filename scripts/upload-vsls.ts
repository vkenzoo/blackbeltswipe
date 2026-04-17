#!/usr/bin/env bun
/**
 * Upload bulk: sobe VSLs dos zips em docs/references/ pro Supabase Storage.
 *
 * Regras:
 * - Pula arquivos > 50MB (Supabase Free tier limit)
 * - Pula ofertas que não existem no DB (mapping explícito abaixo)
 * - Pula ofertas que já têm vsl_uploaded_at (idempotente)
 * - Escolhe o mp4 MAIS GORDO (menor que 50MB) de cada pasta de oferta
 * - Gera thumbnail (frame aos 3s) via ffmpeg
 *
 * Uso:
 *   bun --env-file=.env.local run scripts/upload-vsls.ts
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync, statSync } from "fs";
import { execSync } from "child_process";
import { resolve, basename, join } from "path";
import { createClient } from "@supabase/supabase-js";

const REFS = resolve(process.cwd(), "docs/references");
const WORK = "/tmp/bbs-upload-working";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB Supabase free tier

// ────────────────────────────────────────────────────────────
// Mapping: zip folder name → DB offer slug (20 que existem no DB)
// ────────────────────────────────────────────────────────────
const FOLDER_TO_SLUG: Record<string, string> = {
  "QUIZ BOTTREL": "quiz-bottrel",
  "MEU SISTEMA LUCRATIVO": "meu-sistema-lucrativo",
  "ELIDA DIAS MSM": "elida-dias-msm",
  "BRUNA SOARES METODO RENDA ANONIMA TIKTOK": "bruna-soares-renda-anonima",
  "ANA NEVES PRODUTOS VIRAIS MVA": "ana-neves-produtos-virais",
  "METODO LOW TICKET JOAO PEDRO ALVES (MONSTRO)": "joao-pedro-alves-monstro",
  "SISTEMA GPS GUCASTRO1": "sistema-gps-gucastro",
  "PRIMEIRA VENDA COM IA": "primeira-venda-com-ia",
  "OLIVIO BRITO SISTEMA DE LUCRO": "olivio-brito-sistema-lucro",
  "METODO HABILIDADE DE OURO": "metodo-habilidade-de-ouro",
  "INICIAMAZON TOME MARCOS": "iniciamazon-tome-marcos",
  "THE AI CREATOR COURSE CONTENT CREATORS EUA": "the-ai-creator-course",
  "MAQUINA DAS VENDAS ONLINE MATHEUS BORGES": "maquina-de-vendas-matheus-borges",
  "GABRIEL NAVARRO 0 AO INVESTIDOR": "gabriel-navarro-0-ao-investidor",
  "TESTE DOS ARQUETIPOS JULIA OTTONI": "julia-ottoni-arquetipos",
  "RUPTURA VIRAL": "ruptura-viral",
  "ROBO MILIONARIO": "robo-milionario",
  "VANESSA LOPES VIRADA TIKTOK SHOP": "vanessa-lopes-tiktok-shop",
  "NATHALIA BEAUTY": "nathalia-beauty",
  "METODO EURODROP": "metodo-eurodrop",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !service) {
  console.error("❌ Faltam variáveis em .env.local");
  process.exit(1);
}

const supa = createClient(url, service, { auth: { persistSession: false } });

// deps check
try { execSync("which ffmpeg", { stdio: "pipe" }); } catch {
  console.error("❌ ffmpeg não instalado (brew install ffmpeg)");
  process.exit(1);
}
const HAS_FFPROBE = (() => {
  try { execSync("which ffprobe", { stdio: "pipe" }); return true; } catch { return false; }
})();

if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

type ZipEntry = { zip: string; innerPath: string; size: number };

function listMp4sInAllZips(): ZipEntry[] {
  const zips = execSync(`ls "${REFS}"/*.zip`, { encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);

  const entries: ZipEntry[] = [];
  for (const zip of zips) {
    const out = execSync(`unzip -l "${zip}"`, { encoding: "utf-8" });
    for (const line of out.split("\n")) {
      // linhas do unzip -l: "  size  date  time  VSL/VSL - NAME/path/file.mp4"
      const match = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(VSL\/VSL - [^/]+\/.+\.mp4)\s*$/);
      if (match) {
        entries.push({
          zip,
          innerPath: match[2],
          size: parseInt(match[1], 10),
        });
      }
    }
  }
  return entries;
}

function offerNameFromPath(innerPath: string): string | null {
  const m = innerPath.match(/^VSL\/VSL - ([^/]+)\//);
  return m ? m[1].trim() : null;
}

function extractFromZip(zip: string, innerPath: string, destFile: string): string {
  // usa -p (pipe to stdout) + shell redirect pra contornar bug UTF-8 do unzip macOS
  // escapa aspas duplas no innerPath
  const escaped = innerPath.replace(/"/g, '\\"');
  execSync(`unzip -p "${zip}" "${escaped}" > "${destFile}"`, {
    stdio: "pipe",
    shell: "/bin/bash",
  });
  return destFile;
}

function getDurationSeconds(mp4: string): number {
  if (HAS_FFPROBE) {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp4}"`,
      { encoding: "utf-8" }
    );
    return Math.round(parseFloat(out.trim()));
  }
  // Fallback: parse duration do stderr do ffmpeg
  try {
    execSync(`ffmpeg -i "${mp4}" -f null -`, { encoding: "utf-8", stdio: "pipe" });
  } catch (e) {
    // ffmpeg sempre exit 1 com "-f null" mas escreve info em stderr
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? "";
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)/);
    if (m) {
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
    }
  }
  return 0;
}

function generateThumbnail(mp4: string, outJpg: string) {
  execSync(
    `ffmpeg -y -ss 00:00:03 -i "${mp4}" -vframes 1 -vf "scale=1280:-2" -q:v 3 "${outJpg}"`,
    { stdio: "pipe" }
  );
}

// ────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────

async function main() {
  console.log("🎬 Upload VSLs → Supabase Storage\n");

  // 1. Pega ofertas atuais do DB
  const { data: offers, error: offersErr } = await supa
    .from("offers")
    .select("id, slug, vsl_uploaded_at");
  if (offersErr) {
    console.error("❌ Falha ao buscar offers:", offersErr.message);
    process.exit(1);
  }
  const offersBySlug = new Map(offers!.map((o) => [o.slug as string, o]));
  console.log(`📋 ${offers!.length} ofertas no DB\n`);

  // 2. Lista todos os mp4s nos zips
  const entries = listMp4sInAllZips();
  console.log(`📦 ${entries.length} arquivos mp4 nos zips\n`);

  // 3. Agrupa por oferta, escolhe o maior que caiba em 50MB
  type Candidate = { offerName: string; slug: string; entry: ZipEntry };
  const byOffer = new Map<string, ZipEntry[]>();
  for (const e of entries) {
    const offerName = offerNameFromPath(e.innerPath);
    if (!offerName) continue;
    if (!byOffer.has(offerName)) byOffer.set(offerName, []);
    byOffer.get(offerName)!.push(e);
  }

  const candidates: Candidate[] = [];
  const skipNoSlug: string[] = [];
  const skipTooBig: string[] = [];
  const skipAlready: string[] = [];

  for (const [offerName, zipEntries] of byOffer) {
    const slug = FOLDER_TO_SLUG[offerName];
    if (!slug) {
      skipNoSlug.push(offerName);
      continue;
    }
    const offer = offersBySlug.get(slug);
    if (!offer) {
      skipNoSlug.push(`${offerName} (slug '${slug}' não existe no DB)`);
      continue;
    }
    if (offer.vsl_uploaded_at) {
      skipAlready.push(slug);
      continue;
    }

    // escolhe o MAIOR mp4 que caiba em MAX_BYTES
    const fits = zipEntries
      .filter((e) => e.size <= MAX_BYTES)
      .sort((a, b) => b.size - a.size);
    if (fits.length === 0) {
      skipTooBig.push(`${offerName} (menor mp4: ${(Math.min(...zipEntries.map((e) => e.size)) / 1024 / 1024).toFixed(1)}MB)`);
      continue;
    }
    candidates.push({ offerName, slug, entry: fits[0] });
  }

  console.log(`✅ ${candidates.length} ofertas pra processar`);
  console.log(`⏭️  ${skipAlready.length} já tinham VSL (idempotente)`);
  console.log(`⏭️  ${skipNoSlug.length} sem match no DB`);
  console.log(`⏭️  ${skipTooBig.length} todos os mp4 > 50MB`);
  if (skipTooBig.length > 0) {
    console.log("\n   Pulados (todos > 50MB):");
    skipTooBig.forEach((s) => console.log(`   - ${s}`));
  }
  console.log();

  if (candidates.length === 0) {
    console.log("Nada pra fazer.");
    return;
  }

  // 4. Processa cada candidata
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < candidates.length; i++) {
    const { offerName, slug, entry } = candidates[i];
    const sizeMB = (entry.size / 1024 / 1024).toFixed(1);
    console.log(`\n[${i + 1}/${candidates.length}] ${slug} (${sizeMB}MB)`);

    const workDir = join(WORK, slug);
    if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

    try {
      // Extrair
      console.log("  📂 extraindo...");
      const mp4Path = join(workDir, "vsl.mp4");
      extractFromZip(entry.zip, entry.innerPath, mp4Path);

      // Metadata
      const duration = getDurationSeconds(mp4Path);
      const actualSize = statSync(mp4Path).size;
      console.log(`     ${duration}s · ${(actualSize / 1024 / 1024).toFixed(1)}MB`);

      // Thumbnail
      console.log("  🖼️  gerando thumb...");
      const thumbPath = join(workDir, "thumb.jpg");
      generateThumbnail(mp4Path, thumbPath);
      const thumbBuf = readFileSync(thumbPath);

      // Upload mp4
      console.log("  ⬆️  upload mp4...");
      const mp4Buf = readFileSync(mp4Path);
      const mp4Key = `${slug}.mp4`;
      const { error: mp4Err } = await supa.storage
        .from("vsls")
        .upload(mp4Key, mp4Buf, {
          contentType: "video/mp4",
          cacheControl: "3600",
          upsert: true,
        });
      if (mp4Err) throw new Error(`mp4 upload: ${mp4Err.message}`);

      // Upload thumb
      console.log("  ⬆️  upload thumb...");
      const thumbKey = `${slug}.jpg`;
      const { error: thumbErr } = await supa.storage
        .from("thumbs")
        .upload(thumbKey, thumbBuf, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });
      if (thumbErr) throw new Error(`thumb upload: ${thumbErr.message}`);

      // Update DB
      console.log("  💾 update DB...");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supa.from("offers") as any)
        .update({
          vsl_storage_path: mp4Key,
          vsl_thumbnail_path: thumbKey,
          vsl_duration_seconds: duration,
          vsl_size_bytes: actualSize,
          vsl_uploaded_at: new Date().toISOString(),
        })
        .eq("slug", slug);
      if (dbErr) throw new Error(`db update: ${dbErr.message}`);

      ok++;
      console.log(`  ✅ ${slug} — ${offerName}`);

      // Cleanup
      rmSync(workDir, { recursive: true, force: true });
    } catch (err) {
      fail++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ ${msg}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ ${ok}/${candidates.length} VSLs uploadadas`);
  if (fail > 0) console.log(`❌ ${fail} falhas`);
  if (skipTooBig.length > 0) {
    console.log(`\n⚠️  ${skipTooBig.length} ofertas ficaram sem VSL (todos os mp4 > 50MB)`);
    console.log(`   Pra subir elas: upgrade Supabase Pro OU compressão via ffmpeg`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
