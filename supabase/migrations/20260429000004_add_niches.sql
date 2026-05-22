-- Add 4 nichos: infantil_maternidade, cristianismo, relacionamento, idiomas.
--
-- Adicionados por demanda do admin pra cobrir verticais que estavam caindo
-- como "renda_extra" ou "mentalidade" erradamente.

alter table public.offers drop constraint if exists offers_niche_check;

alter table public.offers
  add constraint offers_niche_check
  check (niche in (
    'renda_extra',
    'ia_tech',
    'mentalidade',
    'beleza',
    'saude',
    'infantil_maternidade',
    'cristianismo',
    'relacionamento',
    'idiomas'
  ));
