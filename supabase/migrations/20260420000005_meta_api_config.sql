-- ─────────────────────────────────────────────────────────────
-- Meta API Config — singleton row com o access_token persistente.
--
-- Motivo: trocar o token toda vez que expira (60 dias) sem redeploy.
-- Admin cola o token novo via UI em /admin/meta-api.
-- Worker lê daqui em vez do .env (com fallback pro .env).
-- ─────────────────────────────────────────────────────────────

create table if not exists meta_api_config (
  id int primary key default 1 check (id = 1), -- garante singleton
  access_token text,
  /** Expiração estimada (quando token foi gerado + duration retornado pela Meta) */
  expires_at timestamptz,
  /** Última vez que admin atualizou */
  updated_at timestamptz default now() not null,
  /** Quem atualizou */
  updated_by uuid references auth.users,
  /** Última vez que o worker validou o token com uma call real */
  last_validated_at timestamptz,
  /** Se última validação deu erro, guarda a mensagem */
  last_error text,
  /** Incrementa toda vez que detecta erro 190/463 (token expirado/inválido) */
  invalid_since timestamptz
);

-- Garante 1 row única
insert into meta_api_config (id) values (1)
on conflict (id) do nothing;

-- RLS: só admin lê/escreve
alter table meta_api_config enable row level security;

create policy "admin read meta_api_config" on meta_api_config
  for select using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "admin update meta_api_config" on meta_api_config
  for update using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    )
  );
