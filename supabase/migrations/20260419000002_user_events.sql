-- ═══════════════════════════════════════════════════════════════
-- user_events — log de eventos de cada usuário no sistema
-- 2026-04-19
--
-- Captura eventos que não temos em outras tables:
--   - sign_in / sign_out
--   - transcript_download
--   - offer_view (se quisermos habilitar)
--   - profile_update / role_change (admin actions)
--   - favorite_add / favorite_remove (quando UI for real)
--
-- Service role escreve. Users leem os próprios. Admins leem tudo.
-- ═══════════════════════════════════════════════════════════════

create table if not exists user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists user_events_user_created_idx
  on user_events (user_id, created_at desc);

create index if not exists user_events_kind_created_idx
  on user_events (kind, created_at desc);

create index if not exists user_events_created_idx
  on user_events (created_at desc);

-- ────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────
alter table user_events enable row level security;

-- Users leem os próprios eventos
drop policy if exists "own events read" on user_events;
create policy "own events read" on user_events
  for select using (user_id = auth.uid());

-- Admins leem todos os eventos
drop policy if exists "admin read all events" on user_events;
create policy "admin read all events" on user_events
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Service role bypassa RLS automaticamente (worker + API route usam service)
-- Nenhuma policy de INSERT pra clients — só via service role.
