-- RLS verification for liabilities table.
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/rls-liabilities.sql

begin;

-- Setup: ensure two users exist
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'alice@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bob@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false)
on conflict (id) do nothing;

insert into public.liabilities (id, user_id, name, amount)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Mortgage', 50000.00),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob Loan', 10000.00)
on conflict (id) do nothing;

-- Test 1: Alice can only SELECT her own liabilities
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.liabilities;
  assert row_count = 1, format('SELECT: expected 1 row for Alice, got %s', row_count);

  select count(*) into row_count from public.liabilities where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 1, 'SELECT: Alice cannot see her own row';

  select count(*) into row_count from public.liabilities where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert row_count = 0, 'SELECT: Alice can see Bobs row — RLS broken';

  raise notice 'PASS: Alice SELECT isolation';
end $$;

-- Test 2: Alice cannot UPDATE Bob's liability
do $$
declare
  row_count int;
begin
  update public.liabilities set name = 'Hacked' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Alice modified Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice UPDATE isolation';
end $$;

-- Test 3: Alice cannot DELETE Bob's liability
do $$
declare
  row_count int;
begin
  delete from public.liabilities where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('DELETE: Alice deleted Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice DELETE isolation';
end $$;

-- Test 4: Alice cannot INSERT liability with Bob's user_id
do $$
begin
  insert into public.liabilities (user_id, name, amount)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Stolen', 100.00);
  assert false, 'INSERT: Alice inserted liability for Bob — RLS broken';
exception
  when others then
    raise notice 'PASS: Alice INSERT isolation';
end $$;

-- Test 5: Alice can INSERT her own liability
do $$
declare
  new_id uuid;
begin
  insert into public.liabilities (user_id, name, amount)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Credit', 2500.00)
  returning id into new_id;
  assert new_id is not null, 'INSERT: Alice cannot insert her own liability';
  raise notice 'PASS: Alice INSERT own row';
end $$;

-- Test 6: Bob can only SELECT his own liabilities
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.liabilities;
  assert row_count = 1, format('SELECT: expected 1 row for Bob, got %s', row_count);

  select count(*) into row_count from public.liabilities where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 0, 'SELECT: Bob can see Alices row — RLS broken';

  raise notice 'PASS: Bob SELECT isolation';
end $$;

-- Test 7: Bob cannot UPDATE Alice's liability
do $$
declare
  row_count int;
begin
  update public.liabilities set name = 'Hacked' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Bob modified Alices row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Bob UPDATE isolation';
end $$;

-- Cleanup: rollback so test users don't persist
rollback;
