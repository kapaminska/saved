-- Seed file for local development only. Creates a test user with a populated profile.
-- Runs on `npx supabase db reset`. Never apply to production.

begin;

-- Insert test user into auth.users (triggers handle_new_user → auto-creates profiles row)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token,
  recovery_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'test@saved.local',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false
);

-- Update the auto-created profile with sample data
update public.profiles
set
  display_name = 'Test User',
  date_of_birth = '1990-05-15',
  relationship_status = 'single'
where id = '00000000-0000-0000-0000-000000000001';

-- Sample savings goals for local dev (active, completed, abandoned)
insert into public.savings_goals (
  user_id,
  name,
  target_amount,
  saved_amount,
  deadline,
  status,
  completed_at
) values
  (
    '00000000-0000-0000-0000-000000000001',
    'Fundusz awaryjny',
    5000.00,
    2500.00,
    (current_date + interval '6 months')::date,
    'active',
    null
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Wakacje nad morzem',
    3000.00,
    3000.00,
    null,
    'completed',
    now() - interval '7 days'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Nowy laptop',
    8000.00,
    1200.00,
    (current_date + interval '1 year')::date,
    'abandoned',
    null
  );

-- Sample payments for active seed goal (3 months, includes explicit zero month; total = 2500)
insert into public.goal_payments (goal_id, user_id, amount, payment_month)
select
  g.id,
  g.user_id,
  v.amount,
  v.payment_month
from public.savings_goals g
cross join (
  values
    (1000.00, (date_trunc('month', current_date) - interval '2 months')::date),
    (0.00, (date_trunc('month', current_date) - interval '1 month')::date),
    (1500.00, date_trunc('month', current_date)::date)
) as v(amount, payment_month)
where g.user_id = '00000000-0000-0000-0000-000000000001'
  and g.name = 'Fundusz awaryjny'
  and g.status = 'active';

commit;
