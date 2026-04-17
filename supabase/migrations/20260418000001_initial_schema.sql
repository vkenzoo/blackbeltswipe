-- ============================================================================
-- Black Belt Swipe — Initial Schema
-- Fase 02 · 2026-04-18
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Idempotent cleanup (permite re-rodar a migration)
-- ----------------------------------------------------------------------------
drop table if exists public.jobs cascade;
drop table if exists public.favorites cascade;
drop table if exists public.offer_metrics cascade;
drop table if exists public.creatives cascade;
drop table if exists public.pages cascade;
drop table if exists public.offers cascade;
drop table if exists public.profiles cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.is_admin() cascade;

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Profiles (espelha auth.users via trigger)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  avatar_url text,
  role text not null default 'member' check (role in ('admin','member','affiliate')),
  created_at timestamptz not null default now()
);

-- Trigger: criar profile automaticamente quando user cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first_user boolean;
begin
  select count(*) = 0 into is_first_user from public.profiles;

  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when is_first_user then 'admin' else 'member' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Offers
-- ----------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  title text not null,
  niche text not null check (niche in (
    'renda_extra','financas','ecommerce','ia_tech','marketing',
    'desenvolvimento','beleza','saude'
  )),
  language text not null check (language in ('pt-BR','en-US','es-ES')),
  structure text not null check (structure in ('vsl','quiz','low_ticket','infoproduto')),
  traffic_source text not null default 'facebook' check (traffic_source in (
    'facebook','google','tiktok','multi'
  )),
  status text not null default 'draft' check (status in ('active','paused','draft')),
  ad_count int not null default 0,
  launched_at date,
  thumb_gradient int not null default 1 check (thumb_gradient between 1 and 20),

  -- VSL
  vsl_storage_path text,
  vsl_thumbnail_path text,
  vsl_duration_seconds int,
  vsl_size_bytes bigint,
  vsl_uploaded_at timestamptz,

  -- Transcript (via Whisper)
  transcript_text text,
  transcript_preview text,

  -- AI
  ai_summary text,

  flags text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index offers_status_ad_count_idx on public.offers (status, ad_count desc);
create index offers_niche_language_idx on public.offers (niche, language);
create index offers_created_at_idx on public.offers (created_at desc);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger offers_updated_at
  before update on public.offers
  for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Pages (landing pages, ad library, fb page)
-- ----------------------------------------------------------------------------
create table public.pages (
  id uuid primary key default uuid_generate_v4(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  type text not null check (type in ('ad_library','fb_page','main_site','checkout')),
  url text not null,
  title text,
  screenshot_url text,
  fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create index pages_offer_id_idx on public.pages (offer_id);

-- ----------------------------------------------------------------------------
-- Creatives
-- ----------------------------------------------------------------------------
create table public.creatives (
  id uuid primary key default uuid_generate_v4(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  kind text not null check (kind in ('video','image')),
  asset_url text not null,
  thumbnail_url text,
  duration_seconds int,
  captured_at timestamptz not null default now()
);

create index creatives_offer_id_idx on public.creatives (offer_id);

-- ----------------------------------------------------------------------------
-- Offer metrics (séries temporais)
-- ----------------------------------------------------------------------------
create table public.offer_metrics (
  id uuid primary key default uuid_generate_v4(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  time_window text not null check (time_window in ('7d','30d','3m','6m')),
  ad_count int not null,
  spend_estimate numeric,
  sampled_at timestamptz not null default now()
);

create index offer_metrics_offer_window_idx on public.offer_metrics (offer_id, time_window, sampled_at desc);

-- ----------------------------------------------------------------------------
-- Favorites
-- ----------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, offer_id)
);

create index favorites_offer_id_idx on public.favorites (offer_id);

-- ----------------------------------------------------------------------------
-- Jobs (fila de worker)
-- ----------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default uuid_generate_v4(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index jobs_status_created_idx on public.jobs (status, created_at);

-- ============================================================================
-- RLS
-- ============================================================================

-- helper function: user is admin?
create or replace function public.is_admin()
returns boolean
language sql stable
security definer
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- PROFILES
alter table public.profiles enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "profiles updatable by self"
  on public.profiles for update
  using (id = auth.uid());

-- OFFERS
alter table public.offers enable row level security;

create policy "offers active readable by authenticated"
  on public.offers for select
  using (auth.role() = 'authenticated' and (status = 'active' or public.is_admin()));

create policy "offers writable by admin"
  on public.offers for all
  using (public.is_admin())
  with check (public.is_admin());

-- PAGES
alter table public.pages enable row level security;

create policy "pages readable with offer"
  on public.pages for select
  using (
    exists(
      select 1 from public.offers
      where offers.id = pages.offer_id
        and (offers.status = 'active' or public.is_admin())
    )
  );

create policy "pages writable by admin"
  on public.pages for all
  using (public.is_admin())
  with check (public.is_admin());

-- CREATIVES
alter table public.creatives enable row level security;

create policy "creatives readable with offer"
  on public.creatives for select
  using (
    exists(
      select 1 from public.offers
      where offers.id = creatives.offer_id
        and (offers.status = 'active' or public.is_admin())
    )
  );

create policy "creatives writable by admin"
  on public.creatives for all
  using (public.is_admin())
  with check (public.is_admin());

-- OFFER_METRICS
alter table public.offer_metrics enable row level security;

create policy "metrics readable with offer"
  on public.offer_metrics for select
  using (
    exists(
      select 1 from public.offers
      where offers.id = offer_metrics.offer_id
        and (offers.status = 'active' or public.is_admin())
    )
  );

create policy "metrics writable by admin"
  on public.offer_metrics for all
  using (public.is_admin())
  with check (public.is_admin());

-- FAVORITES
alter table public.favorites enable row level security;

create policy "favorites readable by self"
  on public.favorites for select
  using (user_id = auth.uid());

create policy "favorites writable by self"
  on public.favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- JOBS (só admin lê, service role escreve)
alter table public.jobs enable row level security;

create policy "jobs readable by admin"
  on public.jobs for select
  using (public.is_admin());

-- ============================================================================
-- Storage buckets
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('vsls', 'vsls', false),
  ('thumbs', 'thumbs', true),
  ('screenshots', 'screenshots', true)
on conflict (id) do nothing;

-- Drop policies antigas se existirem (idempotente)
drop policy if exists "vsls readable with active offer" on storage.objects;
drop policy if exists "vsls writable by admin" on storage.objects;
drop policy if exists "thumbs public read" on storage.objects;
drop policy if exists "thumbs writable by admin" on storage.objects;
drop policy if exists "screenshots public read" on storage.objects;
drop policy if exists "screenshots writable by admin" on storage.objects;

-- Storage policies: vsls (privado)
create policy "vsls readable with active offer"
  on storage.objects for select
  using (
    bucket_id = 'vsls'
    and auth.role() = 'authenticated'
    and exists(
      select 1 from public.offers
      where offers.vsl_storage_path = storage.objects.name
        and (offers.status = 'active' or public.is_admin())
    )
  );

create policy "vsls writable by admin"
  on storage.objects for all
  using (bucket_id = 'vsls' and public.is_admin())
  with check (bucket_id = 'vsls' and public.is_admin());

-- Storage policies: thumbs (público leitura, admin escrita)
create policy "thumbs public read"
  on storage.objects for select
  using (bucket_id = 'thumbs');

create policy "thumbs writable by admin"
  on storage.objects for all
  using (bucket_id = 'thumbs' and public.is_admin())
  with check (bucket_id = 'thumbs' and public.is_admin());

-- Storage policies: screenshots (público leitura, admin escrita)
create policy "screenshots public read"
  on storage.objects for select
  using (bucket_id = 'screenshots');

create policy "screenshots writable by admin"
  on storage.objects for all
  using (bucket_id = 'screenshots' and public.is_admin())
  with check (bucket_id = 'screenshots' and public.is_admin());
