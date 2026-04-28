-- ─────────────────────────────────────────────────────────────
-- Pages verification gate — impede contaminação de criativos.
--
-- Problema: antes desse fix, o domain discovery criava pages
-- ad_library automaticamente e o sync-creatives sincronizava
-- imediatamente, resultando em criativos de advertisers errados
-- aparecendo em ofertas que nada tinham a ver.
--
-- Fix: toda page ad_library criada via discovery automático fica
-- `verified_for_sync=false`. sync-creatives IGNORA essas pages
-- até um admin aprovar via UI (/admin/offers/[id]/edit).
--
-- Pages criadas manualmente OU antes desse fix ficam com default
-- TRUE — backward compat total, nada do catálogo atual quebra.
-- ─────────────────────────────────────────────────────────────

alter table pages
  add column if not exists verified_for_sync boolean default true not null;

alter table pages
  add column if not exists discovered_via text default 'manual' not null;
-- Valores esperados:
--   'manual'                   — admin cadastrou na UI (sempre verified)
--   'enrich_from_url'          — criada via enrich manual de URL
--   'auto_domain_discovery'    — sweep ou enrich auto (PRECISA REVISÃO)
--   'ad_library_page_search'   — scraping por page_id

-- Índice pro sync: busca pages verified com meta_page_id
create index if not exists idx_pages_verified_for_sync
  on pages (offer_id, verified_for_sync, type)
  where type = 'ad_library' and verified_for_sync = true;

-- Índice pro admin: lista pages não-verificadas por oferta
create index if not exists idx_pages_unverified_review
  on pages (offer_id, created_at desc)
  where verified_for_sync = false;

-- ─────────────────────────────────────────────────────────────
-- Quarantine: marca como NÃO verificadas TODAS as pages criadas
-- nas últimas 48h via discovery automático — provavelmente
-- contaminadas. Admin revisa e aprova/descarta uma a uma.
--
-- Heurística: ad_library + meta_page_id not null + criada há < 48h
-- + título contém "descoberta via" (assinatura do discoverPages).
-- ─────────────────────────────────────────────────────────────

update pages
   set verified_for_sync = false,
       discovered_via = 'auto_domain_discovery'
 where type = 'ad_library'
   and meta_page_id is not null
   and created_at > now() - interval '48 hours'
   and title ilike '%descoberta via%';

-- Log: ver o que foi quarentenado
-- select offer_id, title, created_at from pages
-- where verified_for_sync = false order by created_at desc;
