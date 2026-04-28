-- ═══════════════════════════════════════════════════════════════
-- pages.meta_page_id — cache do page_id extraído de URLs de Ad Library
-- 2026-04-19
--
-- Facebook Ad Library URL format:
--   https://www.facebook.com/ads/library/?view_all_page_id=105225425593115&...
--
-- Extraímos o page_id e cacheamos aqui pra usar na chamada da Ad Library API
-- (endpoint ads_archive aceita `search_page_ids=[<id>]`).
--
-- Idempotente — usa add column if not exists.
-- ═══════════════════════════════════════════════════════════════

alter table pages add column if not exists meta_page_id text;

-- Índice pra lookup rápido
create index if not exists pages_meta_page_id_idx
  on pages (meta_page_id)
  where meta_page_id is not null;

-- Backfill: extrai page_id de URLs do tipo ad_library usando regex
-- Pattern: view_all_page_id=<digits> OU /pages/<anyname>/<digits>
update pages
set meta_page_id = (regexp_match(url, 'view_all_page_id=(\d+)'))[1]
where type = 'ad_library'
  and meta_page_id is null
  and url ~ 'view_all_page_id=\d+';
