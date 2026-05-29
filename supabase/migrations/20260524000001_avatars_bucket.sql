-- Storage bucket pra avatars dos usuários (perfil)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Avatars são públicos (qualquer um pode ver)
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
on storage.objects
for select
using (bucket_id = 'avatars');

-- Cada user só pode escrever no path do próprio profile (avatars/{user_id}/*)
drop policy if exists "avatars user can write own" on storage.objects;
create policy "avatars user can write own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars user can update own" on storage.objects;
create policy "avatars user can update own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars user can delete own" on storage.objects;
create policy "avatars user can delete own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
