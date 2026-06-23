-- savings_goals table: user savings goals with denormalized progress and lifecycle status
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index savings_goals_user_id_status_idx on public.savings_goals (user_id, status);

alter table public.savings_goals enable row level security;

create policy savings_goals_select_own on public.savings_goals
  for select using (auth.uid() = user_id);

create policy savings_goals_insert_own on public.savings_goals
  for insert with check (auth.uid() = user_id);

create policy savings_goals_update_own on public.savings_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_savings_goals_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

create or replace function public.check_savings_goal_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active'
    and new.saved_amount >= new.target_amount then
    new.status := 'completed';
    new.completed_at := now();
  end if;

  return new;
end;
$$;

create trigger savings_goals_check_completion
  before insert or update of saved_amount, target_amount, status on public.savings_goals
  for each row execute function public.check_savings_goal_completion();
