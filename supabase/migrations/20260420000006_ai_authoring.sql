-- ─────────────────────────────────────────────────────────────
-- AI-assisted Authoring — sugestões automáticas via GPT-4o-mini
--
-- A IA NUNCA escreve diretamente em offers.title, structure, etc.
-- Ela salva APENAS em ai_draft (jsonb). Admin revisa via banner
-- em /admin/offers/[id]/edit e clica "Aceitar" pra aplicar.
--
-- Campos de controle:
--   ai_draft            — JSON com sugestões geradas pelo GPT
--   ai_generated_at     — quando o worker rodou
--   ai_accepted_at      — quando admin aprovou (ao menos 1 campo)
--   ai_discarded_at     — quando admin clicou "descartar sugestões"
--   ai_accepted_fields  — audit trail de quais campos foram aceitos
-- ─────────────────────────────────────────────────────────────

alter table offers add column if not exists ai_draft jsonb;
alter table offers add column if not exists ai_generated_at timestamptz;
alter table offers add column if not exists ai_accepted_at timestamptz;
alter table offers add column if not exists ai_discarded_at timestamptz;
alter table offers add column if not exists ai_accepted_fields text[] default array[]::text[];

-- Index parcial pra dashboard "ofertas com review pendente"
create index if not exists idx_offers_pending_ai_review
  on offers (ai_generated_at desc)
  where ai_draft is not null
    and ai_accepted_at is null
    and ai_discarded_at is null;
