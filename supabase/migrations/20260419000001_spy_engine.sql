-- ═══════════════════════════════════════════════════════════════
-- Spy Engine — Daily Freshness + Scale Thermometer
-- 2026-04-19
--
-- Adiciona:
--   - Campos de scoring/velocity/trend em offers
--   - Campos de auto-refresh (last_refreshed_at, refresh_interval_hours)
--   - Campos de auto-pause (consecutive_zero_days, auto_paused_at)
--   - creative_count em offer_metrics (snapshot de quantos criativos ativos)
--   - Tabelas alert_subscriptions + alerts_log (alerts in-app)
--   - Índices pra queries ordered-by-score e lookup de ofertas stale
--   - RLS pra alerts (user só vê os seus)
-- ═══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────
-- offers: campos de scoring + auto-refresh
-- ────────────────────────────────────────────────
alter table offers add column if not exists scale_score int default 0;
alter table offers add column if not exists scale_trend text;            -- 'rising'|'steady'|'cooling'|'dead'
alter table offers add column if not exists scale_velocity numeric(6,2); -- % change 7d
alter table offers add column if not exists last_refreshed_at timestamptz;
alter table offers add column if not exists refresh_interval_hours int default 24;
alter table offers add column if not exists auto_paused_at timestamptz;
alter table offers add column if not exists consecutive_zero_days int default 0;

-- Check constraint no scale_trend
do $$ begin
  alter table offers
    add constraint offers_scale_trend_check
    check (scale_trend is null or scale_trend in ('rising','steady','cooling','dead'));
exception when duplicate_object then null;
end $$;

-- Índice pra queries "top ofertas por score"
create index if not exists offers_scale_score_idx
  on offers (scale_score desc)
  where status = 'active';

-- Índice pra sweep buscar ofertas que precisam refresh
create index if not exists offers_last_refreshed_idx
  on offers (last_refreshed_at nulls first)
  where status in ('active','paused');

-- ────────────────────────────────────────────────
-- offer_metrics: já existe, garantir creative_count + snapshot_1d no check
-- ────────────────────────────────────────────────
alter table offer_metrics add column if not exists creative_count int;

-- Adiciona 'snapshot_1d' aos valores permitidos de time_window
-- (usado pelos snapshots diários do refresh_ad_count)
do $$ begin
  alter table offer_metrics drop constraint if exists offer_metrics_time_window_check;
  alter table offer_metrics
    add constraint offer_metrics_time_window_check
    check (time_window = any (array['7d','30d','3m','6m','snapshot_1d']));
end $$;

-- Índice pra queries "últimos N snapshots de X oferta"
create index if not exists offer_metrics_offer_sampled_idx
  on offer_metrics (offer_id, sampled_at desc);

-- ────────────────────────────────────────────────
-- alert_subscriptions (nova)
-- ────────────────────────────────────────────────
create table if not exists alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  offer_id uuid references offers on delete cascade not null,
  alert_on text[] default array['status_change','score_drop_20','new_creative']::text[],
  created_at timestamptz default now(),
  unique (user_id, offer_id)
);

create index if not exists alert_subs_user_idx on alert_subscriptions (user_id);
create index if not exists alert_subs_offer_idx on alert_subscriptions (offer_id);

-- ────────────────────────────────────────────────
-- alerts_log (nova)
-- ────────────────────────────────────────────────
create table if not exists alerts_log (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references alert_subscriptions on delete cascade,
  user_id uuid references auth.users on delete cascade not null,
  offer_id uuid references offers on delete cascade not null,
  kind text not null,    -- 'status_change'|'score_drop_20'|'new_creative'|'revived'|'auto_paused'
  payload jsonb not null default '{}'::jsonb,
  delivered_via text,    -- 'in_app'|'email'
  seen_at timestamptz,
  sent_at timestamptz default now()
);

create index if not exists alerts_log_user_unseen_idx
  on alerts_log (user_id, sent_at desc)
  where seen_at is null;
create index if not exists alerts_log_user_idx on alerts_log (user_id, sent_at desc);

-- ────────────────────────────────────────────────
-- RLS: users só veem próprios subscriptions/alerts
-- ────────────────────────────────────────────────
alter table alert_subscriptions enable row level security;
alter table alerts_log enable row level security;

drop policy if exists "own subs all" on alert_subscriptions;
create policy "own subs all" on alert_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own alerts select" on alerts_log;
create policy "own alerts select" on alerts_log
  for select
  using (user_id = auth.uid());

drop policy if exists "own alerts update seen" on alerts_log;
create policy "own alerts update seen" on alerts_log
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role insere (worker)
-- (service role bypass RLS automaticamente; policies acima não afetam)

-- ────────────────────────────────────────────────
-- Trigger: quando user favorita oferta, cria alert_subscription automático
-- ────────────────────────────────────────────────
create or replace function auto_subscribe_on_favorite()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into alert_subscriptions (user_id, offer_id)
  values (new.user_id, new.offer_id)
  on conflict (user_id, offer_id) do nothing;
  return new;
end;
$$;

drop trigger if exists favorites_auto_subscribe on favorites;
create trigger favorites_auto_subscribe
  after insert on favorites
  for each row
  execute function auto_subscribe_on_favorite();

-- ────────────────────────────────────────────────
-- Backfill: setar last_refreshed_at = updated_at pra ofertas existentes
-- (evita sweep inicial disparar refresh em TODAS de uma vez)
-- ────────────────────────────────────────────────
update offers
set last_refreshed_at = coalesce(updated_at, created_at)
where last_refreshed_at is null;

-- ═══════════════════════════════════════════════════════════════
-- Fim da migration spy_engine
-- ═══════════════════════════════════════════════════════════════
