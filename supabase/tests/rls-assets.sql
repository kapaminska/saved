-- RLS verification for assets table.
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/rls-assets.sql

begin;

-- Setup: ensure two users exist
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'alice@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bob@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false)
on conflict (id) do nothing;

insert into public.assets (id, user_id, name, amount, category)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Savings', 1000.00, 'savings'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob Cash', 2000.00, 'cash')
on conflict (id) do nothing;

-- Test 1: Alice can only SELECT her own assets
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.assets;
  assert row_count = 1, format('SELECT: expected 1 row for Alice, got %s', row_count);

  select count(*) into row_count from public.assets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 1, 'SELECT: Alice cannot see her own row';

  select count(*) into row_count from public.assets where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert row_count = 0, 'SELECT: Alice can see Bobs row — RLS broken';

  raise notice 'PASS: Alice SELECT isolation';
end $$;

-- Test 2: Alice cannot UPDATE Bob's asset
do $$
declare
  row_count int;
begin
  update public.assets set name = 'Hacked' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Alice modified Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice UPDATE isolation';
end $$;

-- Test 3: Alice cannot DELETE Bob's asset
do $$
declare
  row_count int;
begin
  delete from public.assets where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('DELETE: Alice deleted Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice DELETE isolation';
end $$;

-- Test 4: Alice cannot INSERT asset with Bob's user_id
do $$
begin
  insert into public.assets (user_id, name, amount, category)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Stolen', 100.00, 'cash');
  assert false, 'INSERT: Alice inserted asset for Bob — RLS broken';
exception
  when others then
    raise notice 'PASS: Alice INSERT isolation';
end $$;

-- Test 5: Alice can INSERT her own asset
do $$
declare
  new_id uuid;
begin
  insert into public.assets (user_id, name, amount, category)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice New', 500.00, 'investments')
  returning id into new_id;
  assert new_id is not null, 'INSERT: Alice cannot insert her own asset';
  raise notice 'PASS: Alice INSERT own row';
end $$;

-- Test 6: Bob can only SELECT his own assets
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.assets;
  assert row_count = 1, format('SELECT: expected 1 row for Bob, got %s', row_count);

  select count(*) into row_count from public.assets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 0, 'SELECT: Bob can see Alices row — RLS broken';

  raise notice 'PASS: Bob SELECT isolation';
end $$;

-- Test 7: Bob cannot UPDATE Alice's asset
do $$
declare
  row_count int;
begin
  update public.assets set name = 'Hacked' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Bob modified Alices row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Bob UPDATE isolation';
end $$;

-- Cleanup: rollback so test users don't persist
rollback;
