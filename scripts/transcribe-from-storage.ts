#!/usr/bin/env bun
/**
 * Transcribe VSLs do Supabase Storage com Whisper API.
 *
 * Pipeline por oferta:
 *   1. Skip se `transcript_text` já preenchido (idempotente)
 *   2. Signed URL (10min) pro mp4 em `vsls/`
 *   3. curl → /tmp/bbs-transcribe-working/{slug}.mp4
 *   4. ffmpeg: mp4 → mp3 mono 16kHz 64kbps
 *   5. Se mp3 > 24MB: split em chunks de 20min
 *   6. Pra cada chunk: Whisper `whisper-1`, `verbose_json`
 *   7. Concatena segments + full text
 *   8. UPDATE offers SET transcript_text, transcript_preview, updated_at
 *   9. Cleanup /tmp
 *
 * Uso:
 *   bun --env-file=.env.local run scripts/transcribe-from-storage.ts
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *
 * Filtro opcional:
 *   SLUG=quiz-bottrel bun --env-file=.env.local run scripts/transcribe-from-storage.ts
 *   → processa só essa oferta (pro smoke test)
 */

import {
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  rmSync,
  createWriteStream,
} from "fs";
import { execSync, spawnSync } from "child_process";
import { resolve, join, basename } from "path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const WORK = "/tmp/bbs-transcribe-working";
const MAX_WHISPER_MB = 24; // API limit 25MB, margem
const CHUNK_MINUTES = 20;

// ────────────────────────────────────────────────────────────
// bootstrap
// ────────────────────────────────────────────────────────────

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OAI_KEY = process.env.OPENAI_API_KEY;
const FILTER_SLUG = process.env.SLUG; // optional

if (!SUPA_URL || !SERVICE) {
  console.error("\u274c Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}
if (!OAI_KEY) {
  console.error("\u274c OPENAI_API_KEY ausente em .env.local");
  console.error("   Gera em: https://platform.openai.com/api-keys");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: OAI_KEY });

// deps
try {
  execSync("which ffmpeg", { stdio: "pipe" });
} catch {
  console.error("\u274c ffmpeg n\u00e3o instalado");
  process.exit(1);
}

if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

async function downloadToFile(url: string, destPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error("download no body");
  // Node/Bun-compatible: cast web stream to Node stream
  const nodeStream = Readable.fromWeb(res.body as never);
  await pipeline(nodeStream, createWriteStream(destPath));
  return statSync(destPath).size;
}

function convertToMp3(mp4: string, mp3: string) {
  execSync(
    `ffmpeg -y -i "${mp4}" -vn -ac 1 -ar 16000 -b:a 64k "${mp3}"`,
    { stdio: "pipe" }
  );
}

function durationSeconds(mp3: string): number {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-i", mp3], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  const stderr = res.stderr || "";
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Math.round(
    parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
  );
}

function splitMp3(mp3: string, chunkMinutes: number, workDir: string): string[] {
  const duration = durationSeconds(mp3);
  const chunkSec = chunkMinutes * 60;
  const chunks: string[] = [];
  let i = 0;
  for (let start = 0; start < duration; start += chunkSec) {
    const chunkPath = join(workDir, `chunk-${String(i).padStart(2, "0")}.mp3`);
    execSync(
      `ffmpeg -y -i "${mp3}" -ss ${start} -t ${chunkSec} -c copy "${chunkPath}"`,
      { stdio: "pipe" }
    );
    chunks.push(chunkPath);
    i++;
  }
  return chunks;
}

type Segment = { id: number; start: number; end: number; text: string };
type WhisperResponse = {
  text: string;
  segments?: Segment[];
  duration?: number;
};

async function transcribeFile(audioPath: string): Promise<WhisperResponse> {
  const file = Bun.file(audioPath);
  // @ts-expect-error — openai SDK aceita Bun.file / Blob
  const resp = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    // language: sem forçar — Whisper auto-detecta (tem 1 oferta em EN)
  });
  return resp as unknown as WhisperResponse;
}

// ────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────

type OfferRow = {
  id: string;
  slug: string;
  vsl_storage_path: string | null;
  transcript_text: string | null;
};

async function main() {
  console.log("\ud83c\udf99\ufe0f  Transcribe VSLs from Storage\n");

  let query = supa
    .from("offers")
    .select("id, slug, vsl_storage_path, transcript_text")
    .not("vsl_storage_path", "is", null)
    .order("slug");

  if (FILTER_SLUG) {
    query = query.eq("slug", FILTER_SLUG);
  }

  const { data: offers, error } = (await query) as {
    data: OfferRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    console.error("\u274c query offers:", error.message);
    process.exit(1);
  }

  const pending = (offers ?? []).filter(
    (o) => !o.transcript_text || o.transcript_text.trim().length === 0
  );
  const skipped = (offers ?? []).filter(
    (o) => o.transcript_text && o.transcript_text.trim().length > 0
  );

  console.log(`${offers?.length ?? 0} ofertas com VSL`);
  console.log(`${pending.length} pra transcrever`);
  console.log(`${skipped.length} j\u00e1 tinham transcript (idempotente)`);
  if (FILTER_SLUG) console.log(`(filtro SLUG=${FILTER_SLUG})`);
  console.log();

  if (pending.length === 0) {
    console.log("Nada pra fazer.");
    return;
  }

  let totalOk = 0;
  let totalFail = 0;
  let totalCostUsd = 0;
  let totalSeconds = 0;

  for (let i = 0; i < pending.length; i++) {
    const o = pending[i];
    const tag = `[${i + 1}/${pending.length}] ${o.slug.padEnd(36)}`;
    const workDir = join(WORK, o.slug);
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    mkdirSync(workDir, { recursive: true });

    try {
      // 1. signed URL
      const { data: signed, error: sErr } = await supa.storage
        .from("vsls")
        .createSignedUrl(o.vsl_storage_path!, 600);
      if (sErr || !signed) throw new Error(sErr?.message ?? "sign_failed");

      // 2. download mp4
      process.stdout.write(`${tag} baixando... `);
      const mp4Path = join(workDir, "vsl.mp4");
      const mp4Size = await downloadToFile(signed.signedUrl, mp4Path);
      process.stdout.write(`${(mp4Size / 1024 / 1024).toFixed(1)}MB `);

      // 3. mp4 → mp3
      process.stdout.write(`convertendo... `);
      const mp3Path = join(workDir, "audio.mp3");
      convertToMp3(mp4Path, mp3Path);
      const mp3Size = statSync(mp3Path).size;
      const mp3MB = mp3Size / 1024 / 1024;

      // 4. chunk se precisar
      let chunks: string[];
      if (mp3MB > MAX_WHISPER_MB) {
        process.stdout.write(`chunks(${mp3MB.toFixed(1)}MB)... `);
        chunks = splitMp3(mp3Path, CHUNK_MINUTES, workDir);
      } else {
        chunks = [mp3Path];
      }

      // 5. transcreve
      let fullText = "";
      const allSegments: Segment[] = [];
      let offsetSec = 0;
      for (const chunk of chunks) {
        process.stdout.write(`whisper `);
        const resp = await transcribeFile(chunk);
        fullText += (fullText ? " " : "") + (resp.text ?? "").trim();
        for (const seg of resp.segments ?? []) {
          allSegments.push({
            ...seg,
            start: seg.start + offsetSec,
            end: seg.end + offsetSec,
          });
        }
        offsetSec += resp.duration ?? CHUNK_MINUTES * 60;
      }

      const duration = Math.round(offsetSec);
      totalSeconds += duration;
      const cost = (duration / 60) * 0.006;
      totalCostUsd += cost;

      // 6. preview: primeiros ~500 chars, quebrando em espaço
      const preview =
        fullText.length <= 500
          ? fullText
          : fullText.slice(0, fullText.lastIndexOf(" ", 500)).trim() + "…";

      // 7. update DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uErr } = await (supa.from("offers") as any)
        .update({
          transcript_text: fullText,
          transcript_preview: preview,
        })
        .eq("id", o.id);
      if (uErr) throw new Error(`db update: ${uErr.message}`);

      console.log(
        `\u2705 ${fullText.length} chars \u00b7 $${cost.toFixed(3)}`
      );
      totalOk++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`\u274c ${msg}`);
      totalFail++;
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  console.log(`\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`\u2705 ${totalOk}/${pending.length} transcritas`);
  if (totalFail > 0) console.log(`\u274c ${totalFail} falhas`);
  console.log(
    `   ${Math.round(totalSeconds / 60)}min processados \u00b7 $${totalCostUsd.toFixed(2)} gasto`
  );
}

main().catch((err) => {
  console.error("\u274c Fatal:", err);
  process.exit(1);
});
