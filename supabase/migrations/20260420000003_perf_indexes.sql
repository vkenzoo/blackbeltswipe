-- ─────────────────────────────────────────────────────────────
-- Performance indexes — cobre queries quentes do admin dashboard
-- e do feed público. CREATE INDEX IF NOT EXISTS garante idempotência.
--
-- Cada índice foi escolhido olhando o .explain() das queries reais
-- em lib/queries/**/*.ts + worker sweeps.
-- ─────────────────────────────────────────────────────────────

-- jobs — admin/workers + polling de enrich/refresh
create index if not exists idx_jobs_status_kind
  on jobs (status, kind)
  where status in ('pending', 'running', 'error');

create index if not exists idx_jobs_created_at_desc
  on jobs (created_at desc);

create index if not exists idx_jobs_finished_at_desc
  on jobs (finished_at desc)
  where finished_at is not null;

-- meta_api_calls — /admin/meta-api histograma + top handlers
create index if not exists idx_meta_api_calls_created_at
  on meta_api_calls (created_at desc);

create index if not exists idx_meta_api_calls_handler
  on meta_api_calls (caller_handler, created_at desc)
  where caller_handler is not null;

create index if not exists idx_meta_api_calls_errors
  on meta_api_calls (error_code, created_at desc)
  where error_code is not null;

-- user_events — /admin/membros feed + filtro por kind
create index if not exists idx_user_events_user_created
  on user_events (user_id, created_at desc);

create index if not exists idx_user_events_kind_created
  on user_events (kind, created_at desc);

-- alerts_log — sino + logs unificados
create index if not exists idx_alerts_log_sent_at
  on alerts_log (sent_at desc);

-- offer_metrics — sparkline da detail page
create index if not exists idx_offer_metrics_offer_sampled
  on offer_metrics (offer_id, sampled_at desc);

-- offers — ordering secundário do catálogo quando score é null
create index if not exists idx_offers_ad_count_desc
  on offers (ad_count desc nulls last);

create index if not exists idx_offers_created_at_desc
  on offers (created_at desc);

-- pages + creatives — detail page filtra por offer_id + visible
create index if not exists idx_pages_offer_visible
  on pages (offer_id, visible, display_order)
  where visible = true;

create index if not exists idx_creatives_offer_visible
  on creatives (offer_id, visible, display_order)
  where visible = true;

-- favorites — contagem por user (admin dashboard)
create index if not exists idx_favorites_user
  on favorites (user_id);

-- profiles — join com user_events/alerts (já tem PK em id, mas email pra search)
create index if not exists idx_profiles_created_at_desc
  on profiles (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Verificação manual depois de aplicar:
--   select schemaname, indexname from pg_indexes
--   where schemaname = 'public' and indexname like 'idx_%'
--   order by tablename, indexname;
-- ─────────────────────────────────────────────────────────────
