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
import { execSync, spawnSync } from "child_process";
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

type ZipEntry = { zip: string; index: number; name: string; size: number };

const PY_LIST = `
import zipfile, sys, json
out = []
for zpath in sys.argv[1:]:
    try:
        with zipfile.ZipFile(zpath) as z:
            for i, info in enumerate(z.infolist()):
                if info.filename.lower().endswith('.mp4'):
                    out.append({'zip': zpath, 'index': i, 'name': info.filename, 'size': info.file_size})
    except Exception as e:
        print(f"ERR {zpath}: {e}", file=sys.stderr)
print(json.dumps(out, ensure_ascii=False))
`;

const PY_EXTRACT = `
import zipfile, sys
zpath, idx, dest = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with zipfile.ZipFile(zpath) as z:
    info = z.infolist()[idx]
    with z.open(info) as src, open(dest, 'wb') as dst:
        while True:
            chunk = src.read(1024*1024)
            if not chunk: break
            dst.write(chunk)
`;

function listMp4sInAllZips(): ZipEntry[] {
  const zips = execSync(`ls "${REFS}"/*.zip`, { encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const out = execSync(`python3 -c "${PY_LIST.replace(/"/g, '\\"')}" ${zips.map((z) => `"${z}"`).join(" ")}`, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return JSON.parse(out) as ZipEntry[];
}

function offerNameFromPath(innerPath: string): string | null {
  const m = innerPath.match(/^VSL\/VSL - ([^/]+)\//);
  return m ? m[1].trim() : null;
}

function extractFromZip(zip: string, index: number, destFile: string): string {
  execSync(
    `python3 -c "${PY_EXTRACT.replace(/"/g, '\\"')}" "${zip}" ${index} "${destFile}"`,
    { stdio: "pipe" }
  );
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
  // Fallback: ffmpeg -i SEM output file → exit 1 mas imprime metadata em stderr.
  // Usa spawnSync pra não precisar de try/catch nem esconder stderr.
  const res = spawnSync("ffmpeg", ["-hide_banner", "-i", mp4], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  const stderr = res.stderr || "";
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const s = parseFloat(m[3]); // aceita decimais (e.g. "00:05:33.45")
  return Math.round(h * 3600 + mi * 60 + s);
}

function generateThumbnail(mp4: string, outJpg: string) {
  execSync(
    `ffmpeg -y -ss 00:00:03 -i "${mp4}" -vframes 1 -vf "scale=1280:-2" -q:v 3 "${outJpg}"`,
    { stdio: "pipe" }
  );
}

/**
 * Comprime vídeo até caber em maxBytes. Usa ladder crescente de CRF.
 * Retorna tamanho final em bytes. Throw se não couber nem com CRF 38.
 */
function compressToFit(input: string, output: string, maxBytes: number): number {
  const crfLadder = [28, 32, 35, 38];
  for (const crf of crfLadder) {
    execSync(
      `ffmpeg -y -i "${input}" ` +
        `-c:v libx264 -crf ${crf} -preset fast ` +
        `-vf "scale=-2:'min(720,ih)'" ` +
        `-c:a aac -b:a 64k -ac 1 ` +
        `-movflags +faststart ` +
        `"${output}"`,
      { stdio: "pipe" }
    );
    const size = statSync(output).size;
    console.log(
      `     CRF ${crf} → ${(size / 1024 / 1024).toFixed(1)}MB ${size <= maxBytes ? "✓" : "(muito grande, aumentando CRF)"}`
    );
    if (size <= maxBytes) return size;
  }
  throw new Error(`Arquivo ainda > ${maxBytes} bytes com CRF 38 (tentar upgrade Pro ou reduzir resolução)`);
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
    const offerName = offerNameFromPath(e.name);
    if (!offerName) continue;
    if (!byOffer.has(offerName)) byOffer.set(offerName, []);
    byOffer.get(offerName)!.push(e);
  }

  const candidates: Candidate[] = [];
  const skipNoSlug: string[] = [];
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

    // escolhe o MAIOR mp4 (vai comprimir se > 50MB)
    const sorted = [...zipEntries].sort((a, b) => b.size - a.size);
    candidates.push({ offerName, slug, entry: sorted[0] });
  }

  console.log(`✅ ${candidates.length} ofertas pra processar`);
  console.log(`⏭️  ${skipAlready.length} já tinham VSL (idempotente)`);
  console.log(`⏭️  ${skipNoSlug.length} sem match no DB`);
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
      extractFromZip(entry.zip, entry.index, mp4Path);

      // Metadata original
      const duration = getDurationSeconds(mp4Path);
      const originalSize = statSync(mp4Path).size;
      const originalMB = (originalSize / 1024 / 1024).toFixed(1);
      console.log(`     ${duration}s · ${originalMB}MB original`);

      // Comprimir se necessário
      let uploadPath = mp4Path;
      let finalSize = originalSize;
      if (originalSize > MAX_BYTES) {
        console.log(`  🗜️  comprimindo (ffmpeg H.264 720p)...`);
        const compressedPath = join(workDir, "compressed.mp4");
        finalSize = compressToFit(mp4Path, compressedPath, MAX_BYTES);
        uploadPath = compressedPath;
        const finalMB = (finalSize / 1024 / 1024).toFixed(1);
        const ratio = (originalSize / finalSize).toFixed(1);
        console.log(`     ${originalMB}MB → ${finalMB}MB (${ratio}× menor)`);
      }

      // Thumbnail (gera do arquivo original pra melhor qualidade)
      console.log("  🖼️  gerando thumb...");
      const thumbPath = join(workDir, "thumb.jpg");
      generateThumbnail(mp4Path, thumbPath);
      const thumbBuf = readFileSync(thumbPath);

      // Upload mp4
      console.log("  ⬆️  upload mp4...");
      const mp4Buf = readFileSync(uploadPath);
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
          vsl_size_bytes: finalSize,
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
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
