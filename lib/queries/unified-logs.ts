import { createServiceClient } from "@/lib/supabase/server";

export type UnifiedLogEvent = {
  id: string;
  /** Categoria do evento */
  category:
    | "user"        // sign_in, sign_out, download
    | "admin"       // admin_action, role_change
    | "worker"      // job done/error
    | "alert"       // alert disparado
    | "api"         // chamada à Meta
    | "signup"      // cadastro novo
    | "favorite"    // favorito/desfavorito
    | "offer";      // oferta criada/atualizada
  /** Descrição humana */
  title: string;
  /** Detalhes adicionais */
  subtitle?: string;
  /** Quem disparou (user, admin, sistema) */
  actor?: {
    type: "user" | "system";
    email?: string;
    name?: string;
    avatar?: string | null;
  };
  /** Ofertas envolvida (se aplicável) */
  offer_slug?: string | null;
  /** Se teve erro */
  is_error: boolean;
  /** Timestamp ISO */
  created_at: string;
  /** Fonte técnica (pra debug) */
  source: string;
};

export type LogFilter = {
  category?: string;
  only_errors?: boolean;
  user_id?: string;
  limit?: number;
};

/**
 * Agrega eventos de múltiplas fontes num feed único ordenado por timestamp:
 *   - user_events (sign_in, sign_out, etc)
 *   - alerts_log (alerts enviados)
 *   - jobs (workers executados)
 *   - meta_api_calls (requisições à Meta)
 *   - profiles (cadastros novos)
 *   - favorites (favoritou oferta)
 */
export async function getUnifiedLogs(
  filter: LogFilter = {}
): Promise<UnifiedLogEvent[]> {
  const supa = createServiceClient();
  const limit = filter.limit ?? 80;
  const perSource = Math.max(20, Math.floor(limit / 3));
  const category = filter.category ?? "all";
  const onlyErrors = filter.only_errors ?? false;

  const want = (cat: string) => category === "all" || category === cat;

  // Fetch paralelo — ignorar fontes que não interessam pro filtro
  const promises: Array<Promise<unknown>> = [];

  // 1. user_events
  promises.push(
    want("user") || want("admin") || want("favorite")
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supa as any)
          .from("user_events")
          .select("id, user_id, kind, payload, user_agent, created_at")
          .order("created_at", { ascending: false })
          .limit(perSource)
      : Promise.resolve({ data: [] })
  );

  // 2. alerts_log
  promises.push(
    want("alert")
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supa as any)
          .from("alerts_log")
          .select("id, user_id, offer_id, kind, payload, sent_at")
          .order("sent_at", { ascending: false })
          .limit(perSource)
      : Promise.resolve({ data: [] })
  );

  // 3. jobs (workers)
  promises.push(
    want("worker")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supa as any)
            .from("jobs")
            .select("id, kind, status, error, payload, started_at, finished_at, created_at")
            .order("created_at", { ascending: false })
            .limit(perSource);
          if (onlyErrors) q = q.eq("status", "error");
          return q;
        })()
      : Promise.resolve({ data: [] })
  );

  // 4. meta_api_calls
  promises.push(
    want("api")
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supa as any)
            .from("meta_api_calls")
            .select(
              "id, search_page_ids, search_terms, ads_returned, response_time_ms, error_code, error_message, offer_id, caller_handler, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(perSource);
          if (onlyErrors) q = q.not("error_code", "is", null);
          return q;
        })()
      : Promise.resolve({ data: [] })
  );

  // 5. signups
  promises.push(
    want("signup")
      ? supa
          .from("profiles")
          .select("id, email, name, avatar_url, created_at")
          .order("created_at", { ascending: false })
          .limit(Math.min(perSource, 20))
          .returns<
            {
              id: string;
              email: string;
              name: string | null;
              avatar_url: string | null;
              created_at: string;
            }[]
          >()
      : Promise.resolve({ data: [] })
  );

  // 6. favorites
  promises.push(
    want("favorite")
      ? supa
          .from("favorites")
          .select("user_id, offer_id, created_at")
          .order("created_at", { ascending: false })
          .limit(perSource)
          .returns<{ user_id: string; offer_id: string; created_at: string }[]>()
      : Promise.resolve({ data: [] })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userEvRes, alertsRes, jobsRes, apiRes, signupsRes, favsRes] = (await Promise.all(promises)) as Array<any>;

  // Coletar user_ids + offer_ids pra enrich
  const userIds = new Set<string>();
  const offerIds = new Set<string>();

  for (const e of userEvRes.data ?? []) userIds.add(e.user_id);
  for (const a of alertsRes.data ?? []) {
    userIds.add(a.user_id);
    offerIds.add(a.offer_id);
  }
  for (const j of jobsRes.data ?? []) {
    if (j.payload?.offer_id) offerIds.add(j.payload.offer_id);
  }
  for (const c of apiRes.data ?? []) {
    if (c.offer_id) offerIds.add(c.offer_id);
  }
  for (const f of favsRes.data ?? []) {
    userIds.add(f.user_id);
    offerIds.add(f.offer_id);
  }

  // Fetch profiles + offers
  const [profRes, offerRes] = await Promise.all([
    userIds.size > 0
      ? supa
          .from("profiles")
          .select("id, email, name, avatar_url")
          .in("id", [...userIds])
          .returns<
            {
              id: string;
              email: string;
              name: string | null;
              avatar_url: string | null;
            }[]
          >()
      : Promise.resolve({ data: [] as { id: string; email: string; name: string | null; avatar_url: string | null }[] }),
    offerIds.size > 0
      ? supa
          .from("offers")
          .select("id, slug, title")
          .in("id", [...offerIds])
          .returns<{ id: string; slug: string; title: string }[]>()
      : Promise.resolve({ data: [] as { id: string; slug: string; title: string }[] }),
  ]);

  const pMap = new Map(profRes.data?.map((p) => [p.id, p]) ?? []);
  const oMap = new Map(offerRes.data?.map((o) => [o.id, o]) ?? []);

  // Build events
  const events: UnifiedLogEvent[] = [];

  // user_events
  for (const e of userEvRes.data ?? []) {
    const p = pMap.get(e.user_id);
    const actorCategory = e.kind.startsWith("admin_") ? "admin" : "user";
    const isFavorite = e.kind === "favorite_add" || e.kind === "favorite_remove";
    events.push({
      id: e.id,
      category: isFavorite ? "favorite" : actorCategory,
      title: summarizeUserEvent(e.kind, e.payload),
      subtitle: e.user_agent ? parseBrowser(e.user_agent) : undefined,
      actor: {
        type: "user",
        email: p?.email,
        name: p?.name ?? undefined,
        avatar: p?.avatar_url ?? null,
      },
      offer_slug: e.payload?.offer_slug ?? null,
      is_error: false,
      created_at: e.created_at,
      source: "user_events",
    });
  }

  // alerts
  for (const a of alertsRes.data ?? []) {
    const p = pMap.get(a.user_id);
    const o = oMap.get(a.offer_id);
    events.push({
      id: a.id,
      category: "alert",
      title: summarizeAlert(a.kind, a.payload, o?.title),
      subtitle: o?.slug ?? undefined,
      actor: {
        type: "user",
        email: p?.email,
        name: p?.name ?? undefined,
        avatar: p?.avatar_url ?? null,
      },
      offer_slug: o?.slug ?? null,
      is_error: false,
      created_at: a.sent_at,
      source: "alerts_log",
    });
  }

  // jobs
  for (const j of jobsRes.data ?? []) {
    if (j.status !== "done" && j.status !== "error") continue; // skip pending/running
    const o = j.payload?.offer_id ? oMap.get(j.payload.offer_id) : null;
    events.push({
      id: j.id,
      category: "worker",
      title: summarizeJob(j.kind, j.status),
      subtitle: j.error ? j.error.slice(0, 100) : o?.title ?? undefined,
      actor: { type: "system" },
      offer_slug: o?.slug ?? null,
      is_error: j.status === "error",
      created_at: j.finished_at ?? j.created_at,
      source: "jobs",
    });
  }

  // meta_api_calls
  for (const c of apiRes.data ?? []) {
    const o = c.offer_id ? oMap.get(c.offer_id) : null;
    const hasErr = !!c.error_code || !!c.error_message;
    const query = c.search_page_ids
      ? `page ${c.search_page_ids}`
      : c.search_terms
      ? `domínio "${c.search_terms}"`
      : "query";
    events.push({
      id: c.id,
      category: "api",
      title: hasErr
        ? `❌ Erro Meta API — ${query}`
        : `📡 Consultou Meta — ${query} → ${c.ads_returned ?? 0} ads`,
      subtitle: hasErr
        ? c.error_message?.slice(0, 100)
        : `${c.response_time_ms}ms · ${c.caller_handler ?? ""}`,
      actor: { type: "system" },
      offer_slug: o?.slug ?? null,
      is_error: hasErr,
      created_at: c.created_at,
      source: "meta_api_calls",
    });
  }

  // signups
  for (const s of signupsRes.data ?? []) {
    events.push({
      id: `signup-${s.id}`,
      category: "signup",
      title: "Novo usuário cadastrado",
      actor: {
        type: "user",
        email: s.email,
        name: s.name ?? undefined,
        avatar: s.avatar_url,
      },
      is_error: false,
      created_at: s.created_at,
      source: "profiles",
    });
  }

  // favorites
  for (const f of favsRes.data ?? []) {
    const p = pMap.get(f.user_id);
    const o = oMap.get(f.offer_id);
    events.push({
      id: `fav-${f.user_id}-${f.offer_id}`,
      category: "favorite",
      title: `❤️ Favoritou "${o?.title ?? "oferta"}"`,
      actor: {
        type: "user",
        email: p?.email,
        name: p?.name ?? undefined,
        avatar: p?.avatar_url ?? null,
      },
      offer_slug: o?.slug ?? null,
      is_error: false,
      created_at: f.created_at,
      source: "favorites",
    });
  }

  // Sort + filter por only_errors se necessário
  events.sort((a, b) => b.created_at.localeCompare(a.created_at));

  let filtered = events;
  if (filter.user_id) {
    filtered = filtered.filter(
      (e) => e.actor?.email && pMap.get(filter.user_id!)?.email === e.actor.email
    );
  }

  return filtered.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────
// Summary helpers
// ─────────────────────────────────────────────────────────────

function summarizeUserEvent(
  kind: string,
  payload: Record<string, unknown> | null
): string {
  const p = payload ?? {};
  switch (kind) {
    case "sign_in":
      return "🔓 Entrou no sistema";
    case "sign_up":
      return "✨ Se cadastrou";
    case "sign_out":
      return "🚪 Saiu do sistema";
    case "transcript_download":
      return `📥 Baixou transcrição${p.offer_title ? ` de "${p.offer_title}"` : ""}`;
    case "offer_view":
      return `👁 Visualizou oferta${p.offer_title ? ` "${p.offer_title}"` : ""}`;
    case "favorite_add":
      return "❤️ Favoritou oferta";
    case "favorite_remove":
      return "💔 Removeu favorito";
    case "profile_update":
      return "✏️ Atualizou perfil";
    case "role_change":
      return `🛡 Mudança de role: ${p.from ?? "?"} → ${p.to ?? "?"}`;
    case "admin_action":
      return `🛠 Ação admin: ${p.description ?? "?"}`;
    default:
      return kind;
  }
}

function summarizeAlert(
  kind: string,
  payload: Record<string, unknown> | null,
  offerTitle?: string
): string {
  const p = payload ?? {};
  const ofertaRef = offerTitle ? ` · "${offerTitle}"` : "";
  switch (kind) {
    case "status_change":
      return `🔔 Alerta: oferta mudou de ${p.from ?? "?"} pra ${p.to ?? "?"}${ofertaRef}`;
    case "revived":
      return `🌱 Alerta: oferta ressuscitou${ofertaRef}`;
    case "score_drop_20":
      return `📉 Alerta: score caiu ${p.delta ?? "?"} pontos${ofertaRef}`;
    case "new_creative":
      return `🎨 Alerta: ${p.count ?? "?"} criativo${(p.count as number) > 1 ? "s" : ""} novo${(p.count as number) > 1 ? "s" : ""}${ofertaRef}`;
    case "auto_paused":
      return `⚰️ Alerta: oferta auto-pausada${ofertaRef}`;
    default:
      return `🔔 Alerta: ${kind}${ofertaRef}`;
  }
}

function summarizeJob(kind: string, status: string): string {
  const kindLabel: Record<string, string> = {
    enrich_from_url: "Enriquecimento",
    enrich_offer: "Re-enriquecimento",
    screenshot_page: "Screenshot",
    extract_vsl: "Extração VSL",
    generate_thumb: "Geração de thumb",
    transcribe_vsl: "Transcrição VSL",
    transcribe_creative: "Transcrição criativo",
    refresh_ad_count: "Atualização de contagem",
    compute_scale_score: "Cálculo de score",
  };
  const label = kindLabel[kind] ?? kind;
  return status === "done" ? `⚙️ ${label} concluída` : `❌ ${label} falhou`;
}

function parseBrowser(ua: string): string {
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/edg/i.test(ua)) return "Edge";
  return "Browser";
}
