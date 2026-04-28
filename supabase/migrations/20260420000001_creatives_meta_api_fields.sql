-- ═══════════════════════════════════════════════════════════════
-- creatives: campos da Meta Ad Library API
-- 2026-04-20
--
-- Adiciona dados estruturados que a API oficial entrega e o scrape
-- nunca conseguiu:
--
--   meta_ad_id         — id único da API (pra dedup + lifecycle tracking)
--   meta_snapshot_url  — URL pública do preview no Facebook
--   platforms          — ['FACEBOOK','INSTAGRAM','MESSENGER','AUDIENCE_NETWORK']
--   stopped_at         — null se ativo; populated quando Meta pausa o ad
--   ad_creative_title  — título do ad (ad_creative_link_titles[0])
--   ad_creative_description — descrição (ad_creative_link_descriptions[0])
--   languages          — ['pt','en'] etc
--
-- Habilita:
--   - Auto-detect novo criativo (diff meta_ad_id)
--   - Winners tracking (criativos ativos 30d+)
--   - Copy swipe file (caption + title + description)
--   - Filtro por plataforma no dashboard
-- ═══════════════════════════════════════════════════════════════

alter table creatives add column if not exists meta_ad_id text;
alter table creatives add column if not exists meta_snapshot_url text;
alter table creatives add column if not exists platforms text[];
alter table creatives add column if not exists stopped_at timestamptz;
alter table creatives add column if not exists ad_creative_title text;
alter table creatives add column if not exists ad_creative_description text;
alter table creatives add column if not exists languages text[];

-- Unique constraint pra dedup absoluto por ad_id da Meta
-- (nullable por compat: criativos vindos via Playwright pré-API ficam sem)
create unique index if not exists creatives_meta_ad_id_unique
  on creatives (meta_ad_id)
  where meta_ad_id is not null;

-- Filtros úteis no UI
create index if not exists creatives_offer_stopped_idx
  on creatives (offer_id, stopped_at);

create index if not exists creatives_active_idx
  on creatives (offer_id, published_at desc)
  where stopped_at is null and visible = true;
