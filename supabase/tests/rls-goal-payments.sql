-- RLS verification for goal_payments table.
-- Run against local Supabase:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/tests/rls-goal-payments.sql

begin;

-- Setup: ensure two users exist
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'alice@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bob@test.local', crypt('password', gen_salt('bf')), now(), now(), now(), '', '{"provider":"email","providers":["email"]}', '{}', false)
on conflict (id) do nothing;

-- Populate goals and payments for both users
insert into public.savings_goals (id, user_id, name, target_amount, saved_amount, status)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Goal', 1000.00, 500.00, 'active'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob Goal', 2000.00, 1000.00, 'active')
on conflict (id) do nothing;

insert into public.goal_payments (id, goal_id, user_id, amount, payment_month)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 250.00, date_trunc('month', current_date)::date),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500.00, date_trunc('month', current_date)::date)
on conflict (id) do nothing;

-- Test 1: Alice can only SELECT her own payments
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.goal_payments;
  assert row_count = 1, format('SELECT: expected 1 row for Alice, got %s', row_count);

  select count(*) into row_count from public.goal_payments where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 1, 'SELECT: Alice cannot see her own row';

  select count(*) into row_count from public.goal_payments where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  assert row_count = 0, 'SELECT: Alice can see Bobs row — RLS broken';

  raise notice 'PASS: Alice SELECT isolation';
end $$;

-- Test 2: Alice cannot UPDATE Bob's payment
do $$
declare
  row_count int;
begin
  update public.goal_payments set amount = 999.00 where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Alice modified Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice UPDATE isolation';
end $$;

-- Test 3: Alice cannot DELETE Bob's payment
do $$
declare
  row_count int;
begin
  delete from public.goal_payments where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('DELETE: Alice deleted Bobs row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Alice DELETE isolation';
end $$;

-- Test 4: Alice cannot INSERT payment with Bob's user_id
do $$
begin
  insert into public.goal_payments (goal_id, user_id, amount, payment_month)
  values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100.00, date_trunc('month', current_date)::date);
  assert false, 'INSERT: Alice inserted payment for Bob — RLS broken';
exception
  when others then
    raise notice 'PASS: Alice INSERT isolation';
end $$;

-- Test 5: Bob can only SELECT his own payments
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}';

do $$
declare
  row_count int;
begin
  select count(*) into row_count from public.goal_payments;
  assert row_count = 1, format('SELECT: expected 1 row for Bob, got %s', row_count);

  select count(*) into row_count from public.goal_payments where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert row_count = 0, 'SELECT: Bob can see Alices row — RLS broken';

  raise notice 'PASS: Bob SELECT isolation';
end $$;

-- Test 6: Bob cannot UPDATE Alice's payment
do $$
declare
  row_count int;
begin
  update public.goal_payments set amount = 999.00 where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  get diagnostics row_count = row_count;
  assert row_count = 0, format('UPDATE: Bob modified Alices row (%s rows) — RLS broken', row_count);
  raise notice 'PASS: Bob UPDATE isolation';
end $$;

-- Cleanup: rollback so test users don't persist
rollback;
