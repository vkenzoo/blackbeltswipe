import { createServiceClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "member" | "affiliate";
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  /** Quantidade de ofertas favoritadas */
  favorites_count: number;
  /** Quantidade de alerts recebidos */
  alerts_count: number;
  /** Alerts ainda não vistos */
  alerts_unread: number;
  /** Total de eventos capturados (sign_in, download, etc) */
  events_count: number;
};

export type AppStats = {
  users_total: number;
  users_by_role: { admin: number; member: number; affiliate: number };
  users_signed_in_7d: number;
  offers_total: number;
  offers_by_status: { active: number; paused: number; draft: number };
  creatives_total: number;
  creatives_with_transcript: number;
  pages_total: number;
  pages_with_screenshot: number;
  favorites_total: number;
  alerts_total: number;
  alerts_unseen: number;
  jobs_running: number;
  jobs_pending: number;
  jobs_error_24h: number;
};

export type RecentActivity = {
  id: string;
  /** Tipo: favorite, alert, signup, ou qualquer kind de user_events */
  kind:
    | "favorite"
    | "alert"
    | "signup"
    | "sign_in"
    | "sign_out"
    | "sign_up"
    | "favorite_add"
    | "favorite_remove"
    | "transcript_download"
    | "offer_view"
    | "profile_update"
    | "role_change"
    | "admin_action";
  user_id: string;
  user_email: string;
  user_name: string | null;
  user_avatar: string | null;
  payload_summary: string;
  /** Slug/ID da oferta relacionada, se aplicável */
  offer_slug: string | null;
  /** User agent (browser) — disponível pra eventos de user_events */
  user_agent: string | null;
  created_at: string;
};

/**
 * Lista todos os membros com contagens agregadas.
 * Usa service role pra acessar auth.users.
 */
export async function listMembers(): Promise<Member[]> {
  const supa = createServiceClient();

  // 1. Lista auth.users via admin API (pra pegar last_sign_in_at)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authData, error: authErr } = await (supa.auth as any).admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authErr) {
    console.error("listMembers auth.admin.listUsers error:", authErr);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUsers: Array<any> = authData?.users ?? [];

  // 2. Busca profiles (role + name + avatar)
  const { data: profiles } = await supa
    .from("profiles")
    .select("id, email, name, avatar_url, role, created_at")
    .returns<
      Array<{
        id: string;
        email: string;
        name: string | null;
        avatar_url: string | null;
        role: "admin" | "member" | "affiliate";
        created_at: string;
      }>
    >();

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  // 3. Conta favorites + alerts em batch
  const { data: favs } = await supa
    .from("favorites")
    .select("user_id")
    .returns<{ user_id: string }[]>();
  const favCountMap = new Map<string, number>();
  for (const f of favs ?? []) {
    favCountMap.set(f.user_id, (favCountMap.get(f.user_id) ?? 0) + 1);
  }

  // alerts_log (novo do spy_engine)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: alerts } = await (supa as any)
    .from("alerts_log")
    .select("user_id, seen_at")
    .returns<{ user_id: string; seen_at: string | null }[]>();
  const alertsCountMap = new Map<string, number>();
  const alertsUnreadMap = new Map<string, number>();
  for (const a of alerts ?? []) {
    alertsCountMap.set(a.user_id, (alertsCountMap.get(a.user_id) ?? 0) + 1);
    if (!a.seen_at) {
      alertsUnreadMap.set(a.user_id, (alertsUnreadMap.get(a.user_id) ?? 0) + 1);
    }
  }

  // user_events counts (sign_in, downloads, etc)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (supa as any)
    .from("user_events")
    .select("user_id")
    .returns<{ user_id: string }[]>();
  const eventsCountMap = new Map<string, number>();
  for (const e of events ?? []) {
    eventsCountMap.set(e.user_id, (eventsCountMap.get(e.user_id) ?? 0) + 1);
  }

  // 4. Merge
  const members: Member[] = authUsers.map((u) => {
    const p = profileMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? p?.email ?? "",
      name: p?.name ?? null,
      avatar_url: p?.avatar_url ?? null,
      role: (p?.role ?? "member") as "admin" | "member" | "affiliate",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      favorites_count: favCountMap.get(u.id) ?? 0,
      alerts_count: alertsCountMap.get(u.id) ?? 0,
      alerts_unread: alertsUnreadMap.get(u.id) ?? 0,
      events_count: eventsCountMap.get(u.id) ?? 0,
    };
  });

  // Ordena: admin primeiro, depois por last_sign_in_at desc, depois por created_at
  members.sort((a, b) => {
    if (a.role !== b.role) {
      const order = { admin: 0, member: 1, affiliate: 2 };
      return order[a.role] - order[b.role];
    }
    const al = a.last_sign_in_at ?? "0";
    const bl = b.last_sign_in_at ?? "0";
    if (al !== bl) return bl.localeCompare(al);
    return b.created_at.localeCompare(a.created_at);
  });

  return members;
}

/**
 * Stats agregados do app todo.
 */
export async function getAppStats(): Promise<AppStats> {
  const supa = createServiceClient();

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Executa tudo em paralelo
  const [
    profiles,
    offersRes,
    creativesRes,
    pagesRes,
    favsRes,
    alertsRes,
    alertsUnseenRes,
    jobsRunning,
    jobsPending,
    jobsError24h,
    authUsersRes,
  ] = await Promise.all([
    supa.from("profiles").select("role").returns<{ role: string }[]>(),
    supa
      .from("offers")
      .select("status", { count: "exact" })
      .returns<{ status: string }[]>(),
    supa.from("creatives").select("transcript_text", { count: "exact" }),
    supa.from("pages").select("screenshot_url", { count: "exact" }),
    supa.from("favorites").select("user_id", { count: "exact", head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supa as any)
      .from("alerts_log")
      .select("id", { count: "exact", head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supa as any)
      .from("alerts_log")
      .select("id", { count: "exact", head: true })
      .is("seen_at", null),
    supa
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running"),
    supa
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supa
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "error")
      .gte("created_at", since24h),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supa.auth as any).admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  // Count users by role
  const users_by_role = { admin: 0, member: 0, affiliate: 0 };
  for (const p of profiles.data ?? []) {
    if (p.role === "admin") users_by_role.admin++;
    else if (p.role === "affiliate") users_by_role.affiliate++;
    else users_by_role.member++;
  }

  // Users signed in 7d
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUsers: any[] = authUsersRes?.data?.users ?? [];
  const users_signed_in_7d = authUsers.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= since7d
  ).length;

  // Offers by status
  const offers_by_status = { active: 0, paused: 0, draft: 0 };
  for (const o of offersRes.data ?? []) {
    if (o.status === "active") offers_by_status.active++;
    else if (o.status === "paused") offers_by_status.paused++;
    else offers_by_status.draft++;
  }

  // Creatives com transcript
  const creatives_with_transcript = (creativesRes.data ?? []).filter(
    (c) => c.transcript_text != null && c.transcript_text !== ""
  ).length;

  // Pages com screenshot
  const pages_with_screenshot = (pagesRes.data ?? []).filter(
    (p) => p.screenshot_url != null
  ).length;

  return {
    users_total: authUsers.length,
    users_by_role,
    users_signed_in_7d,
    offers_total: offersRes.count ?? 0,
    offers_by_status,
    creatives_total: creativesRes.count ?? 0,
    creatives_with_transcript,
    pages_total: pagesRes.count ?? 0,
    pages_with_screenshot,
    favorites_total: favsRes.count ?? 0,
    alerts_total: alertsRes.count ?? 0,
    alerts_unseen: alertsUnseenRes.count ?? 0,
    jobs_running: jobsRunning.count ?? 0,
    jobs_pending: jobsPending.count ?? 0,
    jobs_error_24h: jobsError24h.count ?? 0,
  };
}

export type ActivityFilter = {
  kind?: string; // "all" | "sign_in" | "favorite" | "alert" | "signup" | "transcript_download" | ...
  user_id?: string;
  limit?: number;
};

/**
 * Atividade recente: merge de 4 fontes (user_events + favorites + alerts + signups).
 * Aceita filtro por kind e/ou user_id.
 */
export async function getRecentActivity(
  filter: ActivityFilter = {}
): Promise<RecentActivity[]> {
  const supa = createServiceClient();
  const limit = filter.limit ?? 50;
  // Pega mais de cada fonte pra garantir limit após merge+sort
  const perSource = Math.min(200, limit * 2);

  // Helpers pra check de filtro
  const kindFilter = filter.kind && filter.kind !== "all" ? filter.kind : null;
  const wantsFavorite = !kindFilter || kindFilter === "favorite";
  const wantsAlert = !kindFilter || kindFilter === "alert";
  const wantsSignup = !kindFilter || kindFilter === "signup";
  const wantsEvents =
    !kindFilter ||
    [
      "sign_in",
      "sign_out",
      "sign_up",
      "transcript_download",
      "offer_view",
      "profile_update",
      "role_change",
      "admin_action",
      "favorite_add",
      "favorite_remove",
    ].includes(kindFilter);

  // ─── Fetch paralelo ───
  const userScopeEq = filter.user_id ? { user_id: filter.user_id } : null;

  const promises: Array<Promise<unknown>> = [];

  // favorites
  promises.push(
    wantsFavorite
      ? (() => {
          let q = supa
            .from("favorites")
            .select("user_id, offer_id, created_at")
            .order("created_at", { ascending: false })
            .limit(perSource);
          if (userScopeEq) q = q.eq("user_id", userScopeEq.user_id);
          return q.returns<{ user_id: string; offer_id: string; created_at: string }[]>();
        })()
      : Promise.resolve({ data: [] as { user_id: string; offer_id: string; created_at: string }[] })
  );

  // alerts
  promises.push(
    wantsAlert
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supa as any)
            .from("alerts_log")
            .select("id, user_id, offer_id, kind, payload, sent_at")
            .order("sent_at", { ascending: false })
            .limit(perSource);
          if (userScopeEq) q = q.eq("user_id", userScopeEq.user_id);
          return q;
        })()
      : Promise.resolve({ data: [] })
  );

  // signups (de profiles)
  promises.push(
    wantsSignup
      ? (() => {
          let q = supa
            .from("profiles")
            .select("id, created_at")
            .order("created_at", { ascending: false })
            .limit(perSource);
          if (userScopeEq) q = q.eq("id", userScopeEq.user_id);
          return q.returns<{ id: string; created_at: string }[]>();
        })()
      : Promise.resolve({ data: [] as { id: string; created_at: string }[] })
  );

  // user_events
  promises.push(
    wantsEvents
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supa as any)
            .from("user_events")
            .select("id, user_id, kind, payload, user_agent, created_at")
            .order("created_at", { ascending: false })
            .limit(perSource);
          if (userScopeEq) q = q.eq("user_id", userScopeEq.user_id);
          if (kindFilter && kindFilter !== "favorite" && kindFilter !== "alert" && kindFilter !== "signup") {
            q = q.eq("kind", kindFilter);
          }
          return q;
        })()
      : Promise.resolve({ data: [] })
  );

  const [favsRes, alertsRes, signupsRes, eventsRes] = (await Promise.all(
    promises
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as Array<any>;

  // ─── Coleta user_ids + offer_ids pra batch fetch ───
  const userIds = new Set<string>();
  const offerIds = new Set<string>();

  for (const f of favsRes.data ?? []) {
    userIds.add(f.user_id);
    offerIds.add(f.offer_id);
  }
  for (const a of alertsRes.data ?? []) {
    userIds.add(a.user_id);
    offerIds.add(a.offer_id);
  }
  for (const s of signupsRes.data ?? []) {
    userIds.add(s.id);
  }
  for (const e of eventsRes.data ?? []) {
    userIds.add(e.user_id);
    // payload pode ter offer_id ou creative_id
    if (e.payload?.offer_id) offerIds.add(e.payload.offer_id);
  }

  const [profMapRes, offerMapRes] = await Promise.all([
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

  const pm = new Map(profMapRes.data?.map((p) => [p.id, p]) ?? []);
  const om = new Map(offerMapRes.data?.map((o) => [o.id, o]) ?? []);

  // ─── Build activities ───
  const activities: RecentActivity[] = [];

  for (const f of favsRes.data ?? []) {
    const p = pm.get(f.user_id);
    const o = om.get(f.offer_id);
    activities.push({
      id: `fav-${f.user_id}-${f.offer_id}`,
      kind: "favorite",
      user_id: f.user_id,
      user_email: p?.email ?? "—",
      user_name: p?.name ?? null,
      user_avatar: p?.avatar_url ?? null,
      payload_summary: `favoritou "${o?.title ?? "oferta"}"`,
      offer_slug: o?.slug ?? null,
      user_agent: null,
      created_at: f.created_at,
    });
  }

  for (const a of alertsRes.data ?? []) {
    const p = pm.get(a.user_id);
    const o = om.get(a.offer_id);
    const desc =
      a.kind === "status_change"
        ? `alerta: ${a.payload?.from ?? "?"} → ${a.payload?.to ?? "?"}`
        : a.kind === "revived"
        ? `alerta: oferta ressuscitou`
        : a.kind === "score_drop_20"
        ? `alerta: score caiu ${a.payload?.delta ?? "?"}pts`
        : `alerta: ${a.kind}`;
    activities.push({
      id: a.id,
      kind: "alert",
      user_id: a.user_id,
      user_email: p?.email ?? "—",
      user_name: p?.name ?? null,
      user_avatar: p?.avatar_url ?? null,
      payload_summary: `${desc} · ${o?.title ?? "oferta"}`,
      offer_slug: o?.slug ?? null,
      user_agent: null,
      created_at: a.sent_at,
    });
  }

  for (const s of signupsRes.data ?? []) {
    const p = pm.get(s.id);
    activities.push({
      id: `signup-${s.id}`,
      kind: "signup",
      user_id: s.id,
      user_email: p?.email ?? "—",
      user_name: p?.name ?? null,
      user_avatar: p?.avatar_url ?? null,
      payload_summary: "se cadastrou",
      offer_slug: null,
      user_agent: null,
      created_at: s.created_at,
    });
  }

  for (const e of eventsRes.data ?? []) {
    const p = pm.get(e.user_id);
    const o = e.payload?.offer_id ? om.get(e.payload.offer_id) : null;
    const summary = summarizeEvent(e.kind, e.payload, o);
    activities.push({
      id: e.id,
      kind: e.kind,
      user_id: e.user_id,
      user_email: p?.email ?? "—",
      user_name: p?.name ?? null,
      user_avatar: p?.avatar_url ?? null,
      payload_summary: summary,
      offer_slug: o?.slug ?? e.payload?.offer_slug ?? null,
      user_agent: e.user_agent ?? null,
      created_at: e.created_at,
    });
  }

  activities.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return activities.slice(0, limit);
}

/**
 * Descrição humana pra cada tipo de user_event.
 */
function summarizeEvent(
  kind: string,
  payload: Record<string, unknown> | null | undefined,
  offer?: { title: string } | null
): string {
  const p = payload ?? {};
  switch (kind) {
    case "sign_in":
      return `logou (${p.method ?? "password"})`;
    case "sign_up":
      return "se cadastrou e entrou";
    case "sign_out":
      return "fez logout";
    case "favorite_add":
      return `favoritou ${offer?.title ? `"${offer.title}"` : "oferta"}`;
    case "favorite_remove":
      return `desfavoritou ${offer?.title ? `"${offer.title}"` : "oferta"}`;
    case "transcript_download":
      return `baixou transcrição ${
        offer?.title ? `· "${offer.title}"` : p.offer_title ? `· "${p.offer_title}"` : ""
      }`;
    case "offer_view":
      return `viu oferta ${offer?.title ? `"${offer.title}"` : ""}`;
    case "profile_update":
      return "atualizou perfil";
    case "role_change":
      return `role mudou: ${p.from ?? "?"} → ${p.to ?? "?"}`;
    case "admin_action":
      return `ação admin: ${p.description ?? "?"}`;
    default:
      return kind;
  }
}
