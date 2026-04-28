import { createServiceClient } from "@/lib/supabase/server";

/**
 * Relatório friendly de erros pra admins não-técnicos.
 *
 * Agrega erros de 2 fontes:
 *   - jobs (status='error') — workers que falharam
 *   - meta_api_calls (error_code not null) — chamadas à Meta que falharam
 *
 * Cada grupo tem uma mensagem em português simples + sugestão de ação.
 */

export type ErrorGroup = {
  id: string;
  source: "jobs" | "meta_api_calls";
  /** Título curto em pt-BR */
  title: string;
  /** Explicação friendly pro admin */
  explanation: string;
  /** O que fazer pra resolver */
  action_hint: string;
  /** Severidade — drives color */
  severity: "low" | "medium" | "high" | "critical";
  /** Quantas vezes aconteceu */
  count: number;
  /** Última ocorrência */
  last_seen: string;
  /** Primeira ocorrência */
  first_seen: string;
  /** Amostra da mensagem técnica original */
  sample_message?: string;
  /** Dimensão secundária (ex: handler, error_code) */
  dimension?: string;
  /** Ofertas envolvidas (slug list, até 5) */
  sample_offers?: string[];
};

export type ErrorsSummary = {
  total_errors: number;
  groups: ErrorGroup[];
  /** Total de erros nas últimas 24h (pra alerta de spike) */
  errors_24h: number;
  /** Total de erros 7d */
  errors_7d: number;
};

/**
 * Busca e agrupa erros recentes.
 *
 * @param hoursBack Janela de tempo (default 168h = 7 dias)
 */
export async function getErrorReports(
  hoursBack: number = 168
): Promise<ErrorsSummary> {
  const supa = createServiceClient();
  const since = new Date(
    Date.now() - hoursBack * 60 * 60 * 1000
  ).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Jobs com erro
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobErrors } = await (supa as any)
    .from("jobs")
    .select("id, kind, error, payload, finished_at, created_at")
    .eq("status", "error")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  // 2. Meta API errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: apiErrors } = await (supa as any)
    .from("meta_api_calls")
    .select(
      "id, error_code, error_subcode, error_message, caller_handler, offer_id, created_at"
    )
    .not("error_code", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobs = (jobErrors ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apis = (apiErrors ?? []) as any[];

  // Coletar offer_ids pra lookup de slugs
  const offerIds = new Set<string>();
  for (const j of jobs) if (j.payload?.offer_id) offerIds.add(j.payload.offer_id);
  for (const a of apis) if (a.offer_id) offerIds.add(a.offer_id);

  const { data: offers } =
    offerIds.size > 0
      ? await supa
          .from("offers")
          .select("id, slug")
          .in("id", [...offerIds])
          .returns<{ id: string; slug: string }[]>()
      : { data: [] as { id: string; slug: string }[] };

  const slugMap = new Map(offers?.map((o) => [o.id, o.slug]) ?? []);

  // ─────────────────────────────────────────────
  // Agrupa jobs por (kind, patternOfError)
  // ─────────────────────────────────────────────
  const jobBuckets = new Map<
    string,
    {
      kind: string;
      pattern: string;
      count: number;
      first_seen: string;
      last_seen: string;
      sample_message: string;
      offers: Set<string>;
    }
  >();

  for (const j of jobs) {
    const pattern = extractErrorPattern(j.error ?? "");
    const key = `${j.kind}::${pattern}`;
    const existing = jobBuckets.get(key);
    const slug = j.payload?.offer_id ? slugMap.get(j.payload.offer_id) : null;
    if (existing) {
      existing.count++;
      if (j.created_at > existing.last_seen) existing.last_seen = j.created_at;
      if (j.created_at < existing.first_seen) existing.first_seen = j.created_at;
      if (slug) existing.offers.add(slug);
    } else {
      jobBuckets.set(key, {
        kind: j.kind,
        pattern,
        count: 1,
        first_seen: j.created_at,
        last_seen: j.created_at,
        sample_message: j.error ?? "(sem detalhes)",
        offers: new Set(slug ? [slug] : []),
      });
    }
  }

  // ─────────────────────────────────────────────
  // Agrupa API errors por (error_code, error_subcode)
  // ─────────────────────────────────────────────
  const apiBuckets = new Map<
    string,
    {
      code: number | null;
      subcode: number | null;
      count: number;
      first_seen: string;
      last_seen: string;
      sample_message: string;
      handler: string;
      offers: Set<string>;
    }
  >();

  for (const a of apis) {
    const key = `${a.error_code ?? "?"}-${a.error_subcode ?? "?"}`;
    const existing = apiBuckets.get(key);
    const slug = a.offer_id ? slugMap.get(a.offer_id) : null;
    if (existing) {
      existing.count++;
      if (a.created_at > existing.last_seen) existing.last_seen = a.created_at;
      if (a.created_at < existing.first_seen) existing.first_seen = a.created_at;
      if (slug) existing.offers.add(slug);
    } else {
      apiBuckets.set(key, {
        code: a.error_code,
        subcode: a.error_subcode,
        count: 1,
        first_seen: a.created_at,
        last_seen: a.created_at,
        sample_message: a.error_message ?? "(sem mensagem)",
        handler: a.caller_handler ?? "?",
        offers: new Set(slug ? [slug] : []),
      });
    }
  }

  // ─────────────────────────────────────────────
  // Build groups com linguagem friendly
  // ─────────────────────────────────────────────
  const groups: ErrorGroup[] = [];

  for (const [key, b] of jobBuckets) {
    const friendly = translateJobError(b.kind, b.pattern, b.sample_message);
    groups.push({
      id: `job::${key}`,
      source: "jobs",
      title: friendly.title,
      explanation: friendly.explanation,
      action_hint: friendly.action,
      severity: friendly.severity,
      count: b.count,
      last_seen: b.last_seen,
      first_seen: b.first_seen,
      sample_message: b.sample_message.slice(0, 300),
      dimension: b.kind,
      sample_offers: [...b.offers].slice(0, 5),
    });
  }

  for (const [key, b] of apiBuckets) {
    const friendly = translateMetaApiError(
      b.code,
      b.subcode,
      b.sample_message
    );
    groups.push({
      id: `api::${key}`,
      source: "meta_api_calls",
      title: friendly.title,
      explanation: friendly.explanation,
      action_hint: friendly.action,
      severity: friendly.severity,
      count: b.count,
      last_seen: b.last_seen,
      first_seen: b.first_seen,
      sample_message: b.sample_message.slice(0, 300),
      dimension: `código ${b.code ?? "?"}${b.subcode ? `.${b.subcode}` : ""}`,
      sample_offers: [...b.offers].slice(0, 5),
    });
  }

  // Ordenar por severity + recent + count
  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  groups.sort((a, b) => {
    // critical > high > medium > low
    const sevDiff = severityRank[b.severity] - severityRank[a.severity];
    if (sevDiff !== 0) return sevDiff;
    // mais recente primeiro
    const timeDiff = b.last_seen.localeCompare(a.last_seen);
    if (timeDiff !== 0) return timeDiff;
    // mais frequente primeiro
    return b.count - a.count;
  });

  // Totals
  const total = jobs.length + apis.length;
  const jobs24h = jobs.filter((j) => j.created_at >= since24h).length;
  const apis24h = apis.filter((a) => a.created_at >= since24h).length;

  return {
    total_errors: total,
    groups,
    errors_24h: jobs24h + apis24h,
    errors_7d: total,
  };
}

// ─────────────────────────────────────────────────────────────
// Pattern extraction
// ─────────────────────────────────────────────────────────────

/** Remove IDs, timestamps e paths específicos pra agrupar mensagens similares */
function extractErrorPattern(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/\d{10,}/g, "<num>")
    .replace(/\d{4}-\d{2}-\d{2}t?[\d:.]*/g, "<timestamp>")
    .replace(/https?:\/\/[^\s)]+/g, "<url>")
    .replace(/\/[a-z0-9_-]+\.(ts|tsx|js|mjs)(:\d+)?/g, "<file>")
    .slice(0, 120);
}

// ─────────────────────────────────────────────────────────────
// Friendly translations
// ─────────────────────────────────────────────────────────────

type FriendlyError = {
  title: string;
  explanation: string;
  action: string;
  severity: "low" | "medium" | "high" | "critical";
};

function translateJobError(
  kind: string,
  pattern: string,
  sample: string
): FriendlyError {
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
    sync_creatives_from_api: "Sync de criativos",
    discover_pages_for_offer: "Descoberta de páginas",
  };
  const label = kindLabel[kind] ?? kind;

  // Padrões conhecidos
  if (/timeout|timed out/.test(pattern)) {
    return {
      title: `${label} com timeout`,
      explanation:
        "A tarefa demorou demais pra terminar e foi cancelada. Pode ser que o Facebook esteja lento hoje, ou o vídeo é muito longo.",
      action:
        "Tenta re-enfileirar o job. Se continuar dando timeout, aumenta o limite no worker.",
      severity: "medium",
    };
  }

  if (/econnreset|enetunreach|etimedout|dns|fetch failed/.test(pattern)) {
    return {
      title: `${label} sem conexão`,
      explanation:
        "O worker perdeu a conexão com a internet ou com o servidor externo (Facebook, Supabase, etc). Problema de rede momentâneo.",
      action:
        "Aguarda alguns minutos e tenta de novo. Se persistir, checa a conexão do servidor do worker.",
      severity: "medium",
    };
  }

  if (/blocked|captcha|checkpoint|challenge/.test(pattern)) {
    return {
      title: `${label} bloqueado pelo Facebook`,
      explanation:
        "O Facebook detectou o scraping e bloqueou. Pode ser temporário (rate limit) ou o IP foi marcado.",
      action:
        "Diminui a frequência de scraping por algumas horas. Considera usar mais stealth no Playwright.",
      severity: "high",
    };
  }

  if (/upload failed|storage/.test(pattern)) {
    return {
      title: `${label} — falha ao salvar no Storage`,
      explanation:
        "O arquivo (vídeo, thumb, screenshot) não conseguiu ser salvo no Supabase Storage. Pode ser falta de espaço ou arquivo grande demais.",
      action:
        "Checa quota do Storage no dashboard do Supabase. Verifica limites do bucket.",
      severity: "high",
    };
  }

  if (/invalid url|malformed|parse/.test(pattern)) {
    return {
      title: `${label} com URL inválida`,
      explanation:
        "A URL cadastrada na oferta está malformada ou não existe mais. O worker não consegue nem abrir a página.",
      action:
        "Abre a oferta no admin e corrige a URL manualmente. Verifica se a landing não saiu do ar.",
      severity: "medium",
    };
  }

  if (/not found|404/.test(pattern)) {
    return {
      title: `${label} — página não encontrada`,
      explanation:
        "O worker conseguiu acessar o servidor mas a página específica retornou 404. A URL provavelmente mudou ou a oferta foi removida.",
      action:
        "Abre a oferta no admin e atualiza a URL. Se a oferta acabou, marca como 'paused'.",
      severity: "low",
    };
  }

  if (/out of memory|heap|oom/.test(pattern)) {
    return {
      title: `${label} — memória insuficiente`,
      explanation:
        "O worker estourou memória. Geralmente acontece com vídeos muito grandes ou muitos jobs rodando em paralelo.",
      action:
        "Aumenta a RAM do container do worker, ou reduz o limite de concorrência dos jobs.",
      severity: "critical",
    };
  }

  if (/permission|unauthorized|forbidden|403|401/.test(pattern)) {
    return {
      title: `${label} sem permissão`,
      explanation:
        "O worker não tinha permissão pra fazer essa ação. Provavelmente um token expirou ou a service key tá errada.",
      action:
        "Verifica SUPABASE_SERVICE_ROLE_KEY e demais envs do worker. Rotaciona tokens se necessário.",
      severity: "high",
    };
  }

  // Default fallback
  return {
    title: `${label} falhou`,
    explanation: `Um job de ${label.toLowerCase()} não conseguiu terminar. Detalhe técnico: "${sample.slice(0, 80)}${sample.length > 80 ? "…" : ""}"`,
    action:
      "Re-enfileira o job pelo /admin/workers. Se acontecer várias vezes seguidas, pede ajuda pro suporte técnico.",
    severity: "medium",
  };
}

function translateMetaApiError(
  code: number | null,
  subcode: number | null,
  sample: string
): FriendlyError {
  // Códigos conhecidos da Meta Graph API
  // Ref: https://developers.facebook.com/docs/graph-api/guides/error-handling
  if (code === 190 || code === 463 || code === 467) {
    return {
      title: "Token da Meta expirou",
      explanation:
        "O token de acesso à Meta API venceu. Todo token de usuário dura ~2h; tokens de app e system user duram mais mas também expiram.",
      action:
        "Gera um token novo em developers.facebook.com e atualiza META_GRAPH_ACCESS_TOKEN no .env. Considera migrar pra system user token pra durar mais.",
      severity: "critical",
    };
  }

  if (code === 10 || subcode === 2332002) {
    return {
      title: "Identidade do app não confirmada",
      explanation:
        "A Meta exige que você confirme sua identidade pra acessar dados da Ad Library API. Sem isso, toda chamada dá erro.",
      action:
        "Vai em business.facebook.com > Configurações > Verificação de Identidade e completa o processo. Pode levar alguns dias.",
      severity: "critical",
    };
  }

  if (code === 4 || code === 17 || code === 613) {
    return {
      title: "Limite de requisições da Meta atingido",
      explanation:
        "Estamos fazendo chamadas demais pra Meta API. O limite é ~200 chamadas por hora. Quando estoura, fica bloqueado por 1h.",
      action:
        "Aguarda 1h pro limite resetar. Reduz a frequência do daily refresh sweep ou aumenta refresh_interval_hours pras ofertas frias.",
      severity: "high",
    };
  }

  if (code === 100) {
    return {
      title: "Parâmetro inválido na chamada Meta",
      explanation:
        "A Meta rejeitou a requisição porque algum parâmetro tá errado. Geralmente é um page_id que não existe mais ou um campo não suportado.",
      action:
        "Verifica a oferta que estava sendo consultada. Pode ser que o advertiser trocou de Page.",
      severity: "medium",
    };
  }

  if (code === 200 || code === 299) {
    return {
      title: "Sem permissão pra esse dado na Meta",
      explanation:
        "O app não tem a permissão ads_archive aprovada, ou a Page consultada tá privada.",
      action:
        "Solicita ads_archive permission em developers.facebook.com. Checa o status do app review.",
      severity: "high",
    };
  }

  if (code === 1 || code === 2) {
    return {
      title: "Erro temporário da Meta",
      explanation:
        "A Meta tá com problema interno. Não é culpa nossa — costuma voltar ao normal em alguns minutos.",
      action:
        "Aguarda e tenta de novo. Se persistir mais de 1h, checa status.facebook.com.",
      severity: "low",
    };
  }

  // Default fallback
  return {
    title: `Erro ${code ?? "desconhecido"} da Meta API`,
    explanation: `A Meta retornou um erro que não conhecemos ainda. Mensagem: "${sample.slice(0, 100)}${sample.length > 100 ? "…" : ""}"`,
    action:
      "Pesquisa o código na documentação da Meta Graph API. Se virar recorrente, mapear aqui pra tradução friendly.",
    severity: "medium",
  };
}
