-- Consolida nichos: de 8 pra 5 categorias.
--
-- Mudanças:
--   marketing, ecommerce, financas → renda_extra (todos são "ganhar dinheiro")
--   desenvolvimento → mentalidade   (melhor descreve: mindset/produtividade/hábitos)
--
-- Estratégia: 2 fases pra evitar conflito com CHECK constraint existente.
--   1. Expande CHECK pra aceitar novos + antigos (transitório)
--   2. UPDATE rows com os novos valores
--   3. Contrai CHECK pra só aceitar os 5 novos

-- ─── Fase 1: CHECK transitório (aceita antigos + novos) ──────────
alter table public.offers drop constraint if exists offers_niche_check;

alter table public.offers
  add constraint offers_niche_check
  check (niche in (
    -- novos (final)
    'renda_extra','ia_tech','mentalidade','beleza','saude',
    -- antigos (transitório — removidos após UPDATE abaixo)
    'marketing','ecommerce','financas','desenvolvimento'
  ));

-- ─── Fase 2: migra dados ──────────────────────────────────────────
update public.offers
set niche = 'renda_extra'
where niche in ('marketing','ecommerce','financas');

update public.offers
set niche = 'mentalidade'
where niche = 'desenvolvimento';

-- ─── Fase 3: CHECK final (strict, só 5 valores) ──────────────────
alter table public.offers drop constraint if exists offers_niche_check;

alter table public.offers
  add constraint offers_niche_check
  check (niche in (
    'renda_extra','ia_tech','mentalidade','beleza','saude'
  ));
