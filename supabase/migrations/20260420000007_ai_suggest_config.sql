-- ─────────────────────────────────────────────────────────────
-- AI Suggest Config — singleton row com toggles + prompts editáveis
--
-- Admin pode em /admin/ai-suggest/config:
--   - Ligar/desligar a feature inteira
--   - Escolher quais campos gerar
--   - Editar system_prompt e user_prompt_template
--   - Ajustar model, temperature, max_tokens
--   - Restaurar defaults
--
-- Worker lê essa config a cada job (cache 30s) — mudanças surtem efeito
-- na próxima oferta processada sem restart.
-- ─────────────────────────────────────────────────────────────

create table if not exists ai_suggest_config (
  id int primary key default 1 check (id = 1),

  -- master switch
  enabled boolean default true not null,

  -- per-field toggles
  enable_title boolean default true not null,
  enable_structure boolean default true not null,
  enable_traffic boolean default true not null,
  enable_summary boolean default true not null,
  enable_tags boolean default true not null,
  enable_price_tier boolean default true not null,

  -- modelo
  model text default 'gpt-4o-mini' not null,
  temperature numeric(3,2) default 0.30 not null,
  max_tokens int default 500 not null,
  include_vision boolean default true not null,
  transcript_max_chars int default 4000 not null,

  -- prompts editáveis (null = usa default hardcoded do código)
  system_prompt text,
  user_prompt_template text,

  -- audit
  updated_at timestamptz default now() not null,
  updated_by uuid references auth.users,
  prompt_version int default 1 not null  -- incrementa quando admin edita prompt
);

insert into ai_suggest_config (id) values (1)
on conflict (id) do nothing;

-- RLS: só admin
alter table ai_suggest_config enable row level security;

create policy "admin read ai_suggest_config" on ai_suggest_config
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin update ai_suggest_config" on ai_suggest_config
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
