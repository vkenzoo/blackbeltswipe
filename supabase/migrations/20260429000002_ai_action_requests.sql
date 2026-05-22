-- AI Action Requests — fila de aprovação pras chamadas de IA pagas.
--
-- Antes: pipelines (enrich_from_url, sync_creatives, sweeps) enfileiravam
-- transcribe_creative, transcribe_vsl, ai_authoring direto na tabela `jobs`
-- → worker pegava e gastava OpenAI/Whisper sem o admin saber.
--
-- Depois: pipelines criam linha aqui em ai_action_requests (status=pending).
-- Admin vê em /admin/aprovacoes → aprovar enfileira job real, rejeitar
-- descarta. Custo estimado fica visível antes da decisão.

create table public.ai_action_requests (
  id uuid primary key default gen_random_uuid(),
  -- Tipo de ação: 'transcribe_creative', 'transcribe_vsl', 'ai_authoring'
  action_type text not null check (
    action_type in ('transcribe_creative', 'transcribe_vsl', 'ai_authoring')
  ),
  -- Oferta dona da ação (sempre presente — admin agrupa por oferta na UI)
  offer_id uuid not null references public.offers(id) on delete cascade,
  -- Recurso específico opcional (ex: creative_id pro transcribe_creative)
  target_id uuid,
  -- Payload pro worker se aprovado (json com offer_id, urls, etc)
  payload jsonb not null default '{}'::jsonb,
  -- Custo estimado em USD (usado pra mostrar pro admin antes de aprovar)
  cost_estimate_usd numeric(8,4) not null default 0,
  -- Contexto que ajuda admin decidir (descrição curta, transcrição preview, etc)
  context jsonb default '{}'::jsonb,
  -- Status: pending (aguardando admin), approved (já enfileirou job),
  -- rejected (descartado pelo admin)
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  -- Auditoria
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  -- Job_id criado quando aprovado (pra rastrear o status)
  job_id uuid references public.jobs(id) on delete set null,
  -- Razão da rejeição (opcional)
  rejection_reason text
);

create index ai_action_requests_pending_idx
  on public.ai_action_requests (created_at desc)
  where status = 'pending';

create index ai_action_requests_offer_idx
  on public.ai_action_requests (offer_id);

-- Dedup: se há request pending pra mesma combinação (offer, action, target),
-- não cria nova — admin vê só uma linha por ação pendente.
create unique index ai_action_requests_unique_pending_idx
  on public.ai_action_requests (offer_id, action_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

-- RLS
alter table public.ai_action_requests enable row level security;

-- Admin reads tudo
create policy ai_action_requests_admin_read on public.ai_action_requests
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Admin escreve (approve/reject)
create policy ai_action_requests_admin_write on public.ai_action_requests
  for update using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Service role (worker) insere
create policy ai_action_requests_service_insert on public.ai_action_requests
  for insert with check (true);

comment on table public.ai_action_requests is
  'Fila de aprovação pras chamadas de IA pagas (Whisper, GPT). Admin aprova antes de gastar.';
