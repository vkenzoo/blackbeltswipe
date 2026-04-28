#!/usr/bin/env bun
/**
 * Backfill de vsl_duration_seconds pras ofertas que têm vsl_storage_path mas
 * duração=0 (bug do upload-vsls.ts antigo, quando ffprobe não tava instalado
 * e o fallback do ffmpeg stderr não casava).
 *
 * Usa ffmpeg direto na signed URL (sem baixar o arquivo) + parse de "Duration:"
 * no stderr.
 *
 * Uso:
 *   bun --env-file=.env.local run scripts/backfill-vsl-duration.ts
 */

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !service) {
  console.error("❌ Faltam variáveis em .env.local");
  process.exit(1);
}
const supa = createClient(url, service, { auth: { persistSession: false } });

function durationFromUrl(u: string): number {
  // ffmpeg -i URL sem output file — sai com erro mas imprime metadata em stderr
  const res = spawnSync("ffmpeg", ["-hide_banner", "-i", u], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  const stderr = res.stderr || "";
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const s = parseFloat(m[3]);
  return Math.round(h * 3600 + mi * 60 + s);
}

async function main() {
  console.log("⏱️  Backfill dura\u00e7\u00e3o de VSLs\n");

  const { data: offers, error } = await supa
    .from("offers")
    .select("id, slug, vsl_storage_path, vsl_duration_seconds")
    .not("vsl_storage_path", "is", null);

  if (error) {
    console.error("\u274c query offers:", error.message);
    process.exit(1);
  }

  const targets = offers!.filter(
    (o) => !o.vsl_duration_seconds || o.vsl_duration_seconds === 0
  );
  console.log(
    `${offers!.length} ofertas com VSL, ${targets.length} com dura\u00e7\u00e3o=0 pra backfill\n`
  );

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const o = targets[i] as {
      id: string;
      slug: string;
      vsl_storage_path: string;
    };
    process.stdout.write(
      `[${i + 1}/${targets.length}] ${o.slug.padEnd(36)} ... `
    );
    try {
      const { data: signed, error: sErr } = await supa.storage
        .from("vsls")
        .createSignedUrl(o.vsl_storage_path, 120);
      if (sErr || !signed) throw new Error(sErr?.message ?? "sign_failed");

      const dur = durationFromUrl(signed.signedUrl);
      if (dur <= 0) throw new Error("duration=0 (parse failed)");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uErr } = await (supa.from("offers") as any)
        .update({ vsl_duration_seconds: dur })
        .eq("id", o.id);
      if (uErr) throw new Error(`update: ${uErr.message}`);

      console.log(`${dur}s (${Math.round(dur / 60)} min) \u2705`);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`\u274c ${msg}`);
      fail++;
    }
  }

  console.log(
    `\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\u2705 ${ok}/${targets.length} atualizadas`
  );
  if (fail > 0) console.log(`\u274c ${fail} falhas`);
}

main().catch((err) => {
  console.error("\u274c Fatal:", err);
  process.exit(1);
});
