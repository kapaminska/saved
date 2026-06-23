-- ai_checkin_requests: sliding-window rate limit tracking for AI check-in parses
create table public.ai_checkin_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_checkin_requests_user_id_created_at_idx
  on public.ai_checkin_requests (user_id, created_at desc);

alter table public.ai_checkin_requests enable row level security;

create policy ai_checkin_requests_insert_own on public.ai_checkin_requests
  for insert with check (auth.uid() = user_id);

create policy ai_checkin_requests_select_own on public.ai_checkin_requests
  for select using (auth.uid() = user_id);
