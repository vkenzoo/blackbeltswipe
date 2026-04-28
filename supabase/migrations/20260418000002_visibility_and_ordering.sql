-- Migration: adiciona visibility + ordering em pages e creatives
-- Permite admin controlar quais pages/creatives aparecem publicamente
-- e ordenar manualmente.

-- ── PAGES ──────────────────────────────────────────────
alter table pages add column if not exists visible boolean default true not null;
alter table pages add column if not exists display_order int default 0 not null;

create index if not exists pages_offer_visible_order
  on pages (offer_id, visible, display_order);

-- ── CREATIVES ──────────────────────────────────────────
alter table creatives add column if not exists visible boolean default true not null;
alter table creatives add column if not exists display_order int default 0 not null;
alter table creatives add column if not exists caption text;
alter table creatives add column if not exists published_at timestamptz;

create index if not exists creatives_offer_visible_order
  on creatives (offer_id, visible, display_order);

-- ── RLS ───────────────────────────────────────────────
-- Creatives policy pra public ver só active offers + visible=true
-- (Pages já tem policy similar na migration inicial — deixa como tá,
-- a aplicação filtra visible na query.)

-- Se já existem policies, skip
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='creatives' and policyname='creatives readable by authenticated'
  ) then
    create policy "creatives readable by authenticated"
      on creatives for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='creatives' and policyname='creatives writable by admin'
  ) then
    create policy "creatives writable by admin"
      on creatives for all
      using (
        exists (
          select 1 from profiles
          where profiles.id = auth.uid() and profiles.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='pages' and policyname='pages writable by admin'
  ) then
    create policy "pages writable by admin"
      on pages for all
      using (
        exists (
          select 1 from profiles
          where profiles.id = auth.uid() and profiles.role = 'admin'
        )
      );
  end if;
end $$;

-- Storage bucket `creatives/` — privado, só authenticated lê, admin escreve
insert into storage.buckets (id, name, public)
values ('creatives', 'creatives', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='creatives readable by authenticated'
  ) then
    create policy "creatives readable by authenticated"
      on storage.objects for select
      using (bucket_id = 'creatives' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='creatives writable by admin'
  ) then
    create policy "creatives writable by admin"
      on storage.objects for insert with check (
        bucket_id = 'creatives'
        and exists (
          select 1 from profiles
          where profiles.id = auth.uid() and profiles.role = 'admin'
        )
      );
  end if;
end $$;
