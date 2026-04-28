import { createServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT_TEMPLATE,
} from "@/lib/worker/ai-authoring-defaults";

export type AiSuggestConfig = {
  id: number;
  enabled: boolean;
  enable_title: boolean;
  enable_structure: boolean;
  enable_traffic: boolean;
  enable_summary: boolean;
  enable_tags: boolean;
  enable_price_tier: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
  include_vision: boolean;
  transcript_max_chars: number;
  system_prompt: string | null;
  user_prompt_template: string | null;
  updated_at: string;
  updated_by: string | null;
  prompt_version: number;
};

export type ResolvedAiSuggestConfig = Omit<
  AiSuggestConfig,
  "system_prompt" | "user_prompt_template"
> & {
  system_prompt: string; // resolved (DB ou default)
  user_prompt_template: string; // resolved (DB ou default)
  /** True se prompt é o default do código */
  using_default_system: boolean;
  using_default_user: boolean;
};

// Cache in-memory do worker (30s) pra não ler DB a cada job
let cached: { config: ResolvedAiSuggestConfig; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidateAiSuggestConfigCache() {
  cached = null;
}

export async function getAiSuggestConfigResolved(): Promise<ResolvedAiSuggestConfig> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.config;
  }

  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supa as any)
    .from("ai_suggest_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const row = (data as AiSuggestConfig | null) ?? null;

  const resolved: ResolvedAiSuggestConfig = row
    ? {
        ...row,
        temperature: Number(row.temperature),
        system_prompt: row.system_prompt ?? DEFAULT_SYSTEM_PROMPT,
        user_prompt_template:
          row.user_prompt_template ?? DEFAULT_USER_PROMPT_TEMPLATE,
        using_default_system: row.system_prompt === null,
        using_default_user: row.user_prompt_template === null,
      }
    : {
        id: 1,
        enabled: true,
        enable_title: true,
        enable_structure: true,
        enable_traffic: true,
        enable_summary: true,
        enable_tags: true,
        enable_price_tier: true,
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 500,
        include_vision: true,
        transcript_max_chars: 4000,
        system_prompt: DEFAULT_SYSTEM_PROMPT,
        user_prompt_template: DEFAULT_USER_PROMPT_TEMPLATE,
        using_default_system: true,
        using_default_user: true,
        updated_at: new Date().toISOString(),
        updated_by: null,
        prompt_version: 1,
      };

  cached = { config: resolved, at: Date.now() };
  return resolved;
}

/** Usado pela API route pra UI — retorna raw (com nulls) pra admin ver o que tá custom */
export async function getAiSuggestConfigRaw(): Promise<AiSuggestConfig | null> {
  const supa = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supa as any)
    .from("ai_suggest_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  return {
    ...(data as AiSuggestConfig),
    temperature: Number((data as AiSuggestConfig).temperature),
  };
}

export type UpdateInput = Partial<
  Omit<
    AiSuggestConfig,
    "id" | "updated_at" | "prompt_version" | "updated_by"
  >
> & { updated_by?: string | null };

export async function updateAiSuggestConfig(
  input: UpdateInput,
  incrementPromptVersion: boolean = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supa = createServiceClient();

  const patch: Record<string, unknown> = { ...input };
  patch.updated_at = new Date().toISOString();
  if (incrementPromptVersion) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: curr } = await (supa as any)
      .from("ai_suggest_config")
      .select("prompt_version")
      .eq("id", 1)
      .maybeSingle();
    const v = (curr as { prompt_version?: number } | null)?.prompt_version ?? 1;
    patch.prompt_version = v + 1;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supa as any)
    .from("ai_suggest_config")
    .update(patch)
    .eq("id", 1);

  invalidateAiSuggestConfigCache();

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resetPromptsToDefault(): Promise<void> {
  await updateAiSuggestConfig(
    {
      system_prompt: null,
      user_prompt_template: null,
    },
    true
  );
}
