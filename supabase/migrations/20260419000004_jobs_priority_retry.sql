-- ═══════════════════════════════════════════════════════════════
-- jobs: priority + retry_at
-- 2026-04-19
--
-- Adiciona:
--   - `priority` — fila prioritária. Sweeps usam 0 (default), user-triggered
--     usa 100. pickJobs ordena DESC priority, ASC created_at.
--   - `retry_at` — quando reenfileirar em caso de falha. Se NULL, pega
--     imediatamente. Usado pelo retry com exponential backoff.
--   - `max_attempts` — cap de retries (default 3). Override por kind.
-- ═══════════════════════════════════════════════════════════════

alter table jobs add column if not exists priority int not null default 0;
alter table jobs add column if not exists retry_at timestamptz;
alter table jobs add column if not exists max_attempts int not null default 3;

-- Índice pro pickJobs (priority desc, created_at asc), com filtro de retry_at
create index if not exists jobs_priority_retry_idx
  on jobs (priority desc, created_at asc)
  where status = 'pending';

-- Backfill: jobs existentes recebem defaults (já acontece pelo default NOT NULL)
-- Nada a fazer.
