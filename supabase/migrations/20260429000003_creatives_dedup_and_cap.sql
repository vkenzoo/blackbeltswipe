-- Dedup de creatives por asset_url dentro da mesma oferta + helper view
-- pra contar criativos.
--
-- Antes:
--   - Sync via Meta API já tinha unique em meta_ad_id (impede dup de ads
--     do FB)
--   - MAS upload manual e Playwright (enrich) podiam inserir mesmo
--     asset_url 2x se chamados em sequência ou retries
--
-- Depois:
--   - Unique em (offer_id, asset_url) impede dup de qualquer fonte
--   - Cap de 30 criativos por oferta enforced no app code (não no DB)

create unique index if not exists creatives_offer_asset_unique
  on public.creatives (offer_id, asset_url);
