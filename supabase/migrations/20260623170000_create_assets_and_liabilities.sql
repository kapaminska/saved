-- assets and liabilities tables for net worth panel (FR-023–FR-027)

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  amount numeric(12, 2) not null check (amount >= 0),
  category text not null check (category in ('cash', 'savings', 'investments', 'real_estate', 'other')),
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_user_id_idx on public.assets (user_id);
create index liabilities_user_id_idx on public.liabilities (user_id);

alter table public.assets enable row level security;
alter table public.liabilities enable row level security;

create policy assets_select_own on public.assets
  for select using (auth.uid() = user_id);

create policy assets_insert_own on public.assets
  for insert with check (auth.uid() = user_id);

create policy assets_update_own on public.assets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy assets_delete_own on public.assets
  for delete using (auth.uid() = user_id);

create policy liabilities_select_own on public.liabilities
  for select using (auth.uid() = user_id);

create policy liabilities_insert_own on public.liabilities
  for insert with check (auth.uid() = user_id);

create policy liabilities_update_own on public.liabilities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy liabilities_delete_own on public.liabilities
  for delete using (auth.uid() = user_id);

create trigger set_assets_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

create trigger set_liabilities_updated_at
  before update on public.liabilities
  for each row execute function public.set_updated_at();
