-- ═══════════════════════════════════════════════════════════════
-- worker_heartbeats — healthcheck do worker
-- 2026-04-19
--
-- Worker escreve uma row por instância a cada N segundos (upsert).
-- /api/worker/health lê essa table pra responder se o worker tá vivo.
--
-- Single-instance hoje (um worker só), mas a table já suporta múltiplas
-- instâncias via worker_id.
-- ═══════════════════════════════════════════════════════════════

create table if not exists worker_heartbeats (
  worker_id text primary key,
  last_beat_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  version text,
  jobs_processed int not null default 0,
  jobs_errored int not null default 0,
  browser_jobs_since_launch int,
  node_version text,
  pid int,
  metadata jsonb not null default '{}'::jsonb
);

-- Só admin lê (api usa service role, então bypassa)
alter table worker_heartbeats enable row level security;

drop policy if exists "admin read heartbeats" on worker_heartbeats;
create policy "admin read heartbeats" on worker_heartbeats
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
