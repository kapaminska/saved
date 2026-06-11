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

commit;
