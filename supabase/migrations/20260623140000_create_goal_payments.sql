-- goal_payments table: monthly payment atoms per savings goal
create table public.goal_payments (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  payment_month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, payment_month)
);

create index goal_payments_user_id_payment_month_idx on public.goal_payments (user_id, payment_month);
create index goal_payments_goal_id_payment_month_idx on public.goal_payments (goal_id, payment_month);

alter table public.goal_payments enable row level security;

create policy goal_payments_select_own on public.goal_payments
  for select using (auth.uid() = user_id);

create policy goal_payments_insert_own on public.goal_payments
  for insert with check (auth.uid() = user_id);

create policy goal_payments_update_own on public.goal_payments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy goal_payments_delete_own on public.goal_payments
  for delete using (auth.uid() = user_id);

create trigger set_goal_payments_updated_at
  before update on public.goal_payments
  for each row execute function public.set_updated_at();
