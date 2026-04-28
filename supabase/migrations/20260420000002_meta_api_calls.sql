-- ═══════════════════════════════════════════════════════════════
-- meta_api_calls — log de requisições à Meta Ad Library API
-- 2026-04-20
--
-- Grava cada chamada ao endpoint /ads_archive (v21.0/graph.facebook.com).
-- Permite:
--   - Monitorar uso da API (rate limit ~200 calls/hour)
--   - Identificar queries custosas ou com erro
--   - Debug de issues (ex: query retornou 0 quando deveria ter ads)
--   - Dashboard de consumo de API pro admin
-- ═══════════════════════════════════════════════════════════════

create table if not exists meta_api_calls (
  id uuid primary key default gen_random_uuid(),
  -- Query params principais (denormalizados pra facilitar agregação)
  search_page_ids text,       -- page_id quando query é por page (ex: "347189425772727")
  search_terms text,          -- termo quando query é por keyword (ex: "techpauloborges.com")
  ad_active_status text,      -- "ACTIVE" | "INACTIVE" | "ALL"
  ad_reached_countries text,  -- JSON string dos países ["BR"]

  -- Resposta
  ads_returned int,           -- quantos ads vieram na resposta
  pages_fetched int,          -- quantas páginas de paginação foram seguidas
  response_time_ms int,       -- tempo total do request
  http_status int,            -- 200, 400, 429, etc

  -- Erro (se houver)
  error_code int,             -- codes do Meta (10, 100, 190, etc)
  error_subcode int,          -- subcode (2332002 = identity not confirmed)
  error_message text,         -- mensagem completa

  -- Context
  caller_handler text,        -- 'refresh_ad_count' | 'sync_creatives' | 'domain_search'
  offer_id uuid references offers on delete set null,

  created_at timestamptz not null default now()
);

-- Índices pra queries de dashboard
create index if not exists meta_api_calls_created_idx
  on meta_api_calls (created_at desc);

create index if not exists meta_api_calls_offer_idx
  on meta_api_calls (offer_id, created_at desc)
  where offer_id is not null;

create index if not exists meta_api_calls_errors_idx
  on meta_api_calls (error_code, created_at desc)
  where error_code is not null;

-- RLS: só admin lê
alter table meta_api_calls enable row level security;
drop policy if exists "admin read meta_api_calls" on meta_api_calls;
create policy "admin read meta_api_calls" on meta_api_calls
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
