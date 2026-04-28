/**
 * Transcrição via Whisper a partir de um arquivo no Supabase Storage.
 *
 * Pipeline:
 *   1. Gera signed URL pro mp4 no bucket
 *   2. Download local /tmp
 *   3. ffmpeg: mp4 → mp3 mono 16kHz 64kbps
 *   4. Se mp3 > 24MB: chunks de 20min
 *   5. Whisper verbose_json por chunk
 *   6. Concat texts + segments com offset correto
 */

import { existsSync, mkdirSync, statSync, rmSync, createWriteStream } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import OpenAI from "openai";

const WORK = "/tmp/bbs-worker-transcribe";
const MAX_WHISPER_MB = 24;
const CHUNK_MINUTES = 20;

export type TranscribeResult = {
  ok: boolean;
  text?: string;
  preview?: string;
  duration?: number;
  error?: string;
};

/**
 * Baixa mp4 do bucket (default `vsls/`), transcreve via Whisper, retorna texto.
 * Se ffmpeg não disponível ou OPENAI_API_KEY faltando, retorna ok:false.
 */
export async function transcribeFromStorage(
  supa: SupabaseClient<Database>,
  storagePath: string,
  bucket: "vsls" | "creatives" = "vsls"
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "no_openai_key" };

  try {
    const which = spawnSync("which", ["ffmpeg"], { stdio: "pipe" });
    if (which.status !== 0) throw new Error("ffmpeg_not_found");
  } catch {
    return { ok: false, error: "no_ffmpeg" };
  }

  const openai = new OpenAI({ apiKey });
  if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });
  const slug = storagePath.replace(/[^a-z0-9]/gi, "_").slice(0, 60);
  const workDir = join(WORK, `${slug}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  try {
    // 1. signed URL
    const { data: signed, error: sErr } = await supa.storage
      .from(bucket)
      .createSignedUrl(storagePath, 600);
    if (sErr || !signed) throw new Error(`signed URL: ${sErr?.message ?? "fail"}`);

    // 2. Download
    const mp4Path = join(workDir, "input.mp4");
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    if (!res.body) throw new Error("no body");
    const nodeStream = Readable.fromWeb(res.body as never);
    await pipeline(nodeStream, createWriteStream(mp4Path));

    // 3. mp4 → mp3 — args array (não shell) pra zero injection risk
    const mp3Path = join(workDir, "audio.mp3");
    const mp3Res = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i", mp4Path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-b:a", "64k",
        mp3Path,
      ],
      { stdio: "pipe" }
    );
    if (mp3Res.status !== 0) {
      throw new Error(
        `ffmpeg_mp3_failed status=${mp3Res.status} stderr=${(mp3Res.stderr?.toString() ?? "").slice(-200)}`
      );
    }
    const mp3Size = statSync(mp3Path).size;
    const mp3MB = mp3Size / 1024 / 1024;

    // 4. Chunks se > 24MB
    let chunks: string[];
    if (mp3MB > MAX_WHISPER_MB) {
      chunks = splitMp3(mp3Path, CHUNK_MINUTES, workDir);
    } else {
      chunks = [mp3Path];
    }

    // 5. Whisper
    let fullText = "";
    let totalDuration = 0;
    const { readFileSync } = await import("fs");
    const { basename: bn } = await import("path");
    for (const chunk of chunks) {
      const buf = readFileSync(chunk);
      // Passa como File (globalThis.File em Node 20+/Bun — tem name)
      const FileCtor = (globalThis as unknown as { File: typeof File }).File;
      const file = new FileCtor([new Uint8Array(buf)], bn(chunk), {
        type: "audio/mpeg",
      });
      const resp = (await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
      })) as { text?: string; duration?: number };
      fullText += (fullText ? " " : "") + (resp.text ?? "").trim();
      totalDuration += resp.duration ?? CHUNK_MINUTES * 60;
    }

    // 6. Preview (500 chars cortando em palavra)
    const preview =
      fullText.length <= 500
        ? fullText
        : fullText.slice(0, fullText.lastIndexOf(" ", 500)).trim() + "…";

    return {
      ok: true,
      text: fullText,
      preview,
      duration: Math.round(totalDuration),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
  }
}

function splitMp3(mp3: string, chunkMinutes: number, workDir: string): string[] {
  // duration via ffmpeg stderr parse
  const res = spawnSync("ffmpeg", ["-hide_banner", "-i", mp3], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  const m = (res.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = m
    ? Math.round(parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]))
    : 0;
  const chunkSec = chunkMinutes * 60;
  const chunks: string[] = [];
  let i = 0;
  for (let start = 0; start < duration; start += chunkSec) {
    const chunkPath = join(workDir, `chunk-${String(i).padStart(2, "0")}.mp3`);
    const chunkRes = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i", mp3,
        "-ss", String(start),
        "-t", String(chunkSec),
        "-c", "copy",
        chunkPath,
      ],
      { stdio: "pipe" }
    );
    if (chunkRes.status !== 0) {
      throw new Error(`chunk_split_failed at ${start}s`);
    }
    chunks.push(chunkPath);
    i++;
  }
  return chunks;
}
