/**
 * GET  /api/admin/ai-suggest/config — retorna config raw + defaults pra UI
 * POST /api/admin/ai-suggest/config — salva alterações
 *       Body: partial config + { action?: "reset_prompts" }
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAiSuggestConfigRaw,
  updateAiSuggestConfig,
  resetPromptsToDefault,
  type UpdateInput,
} from "@/lib/queries/ai-suggest-config";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT_TEMPLATE,
} from "@/lib/worker/ai-authoring-defaults";

export async function GET() {
  await requireAdmin();
  const row = await getAiSuggestConfigRaw();

  return NextResponse.json({
    config: row,
    defaults: {
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      user_prompt_template: DEFAULT_USER_PROMPT_TEMPLATE,
    },
  });
}

const ALLOWED_KEYS: Array<keyof UpdateInput> = [
  "enabled",
  "enable_title",
  "enable_structure",
  "enable_traffic",
  "enable_summary",
  "enable_tags",
  "enable_price_tier",
  "model",
  "temperature",
  "max_tokens",
  "include_vision",
  "transcript_max_chars",
  "system_prompt",
  "user_prompt_template",
];

export async function POST(req: Request) {
  const user = await requireAdmin();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // ── action: reset_prompts ──
  if (body.action === "reset_prompts") {
    await resetPromptsToDefault();
    return NextResponse.json({ ok: true, action: "reset_prompts" });
  }

  // ── update parcial ──
  const patch: UpdateInput = { updated_by: user.id };
  let promptChanged = false;

  for (const key of ALLOWED_KEYS) {
    if (!(key in body)) continue;
    const val = body[key];
    switch (key) {
      case "enabled":
      case "enable_title":
      case "enable_structure":
      case "enable_traffic":
      case "enable_summary":
      case "enable_tags":
      case "enable_price_tier":
      case "include_vision":
        if (typeof val === "boolean") patch[key] = val;
        break;
      case "model":
        if (typeof val === "string" && val.trim().length > 0) {
          patch.model = val.trim();
        }
        break;
      case "temperature":
        if (typeof val === "number" && val >= 0 && val <= 2) {
          patch.temperature = val;
        }
        break;
      case "max_tokens":
        if (typeof val === "number" && val >= 50 && val <= 4000) {
          patch.max_tokens = Math.floor(val);
        }
        break;
      case "transcript_max_chars":
        if (typeof val === "number" && val >= 500 && val <= 12000) {
          patch.transcript_max_chars = Math.floor(val);
        }
        break;
      case "system_prompt":
      case "user_prompt_template":
        if (val === null || val === "") {
          patch[key] = null; // null = volta pro default
          promptChanged = true;
        } else if (typeof val === "string") {
          const trimmed = val.trim();
          if (trimmed.length >= 10 && trimmed.length <= 10000) {
            patch[key] = trimmed;
            promptChanged = true;
          }
        }
        break;
    }
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const res = await updateAiSuggestConfig(patch, promptChanged);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    prompt_version_bumped: promptChanged,
  });
}
