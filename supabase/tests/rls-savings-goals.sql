-- RLS verification for savings_goals table.
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/rls-savings-goals.sql

begin;

-- Setup: ensure two users exist
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'alice@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bob@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false)
on conflict (id) do nothing;

-- Populate goals for both users
insert into public.savings_goals (user_id, name, target_amount, saved_amount, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Goal', 1000.00, 500.00, 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob Goal', 2000.00, 1000.00, 'active')
on conflict do nothing;

-- Test 1: Alice can only SELECT her own goals
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.savings_goals;
  assert row_count = 1, format('SELECT: expected 1 row for Alice, got %s', row_count);

  select count(*) into row_count from public.savings_goals where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 1, 'SELECT: Alice cannot see her own row';

  select count(*) into row_count from public.savings_goals where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert row_count = 0, 'SELECT: Alice can see Bobs row — RLS broken';

  raise notice 'PASS: Alice SELECT isolation';
end $$;

-- Test 2: Alice cannot UPDATE Bob's goal
do $$
declare
  row_count int;
begin
  update public.savings_goals set name = 'Hacked' where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Alice modified Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice UPDATE isolation';
end $$;

-- Test 3: Bob can only SELECT his own goals
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.savings_goals;
  assert row_count = 1, format('SELECT: expected 1 row for Bob, got %s', row_count);

  select count(*) into row_count from public.savings_goals where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 0, 'SELECT: Bob can see Alices row — RLS broken';

  raise notice 'PASS: Bob SELECT isolation';
end $$;

-- Test 4: Bob cannot UPDATE Alice's goal
do $$
declare
  row_count int;
begin
  update public.savings_goals set name = 'Hacked' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Bob modified Alices row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Bob UPDATE isolation';
end $$;

-- Cleanup: rollback so test users don't persist
rollback;
