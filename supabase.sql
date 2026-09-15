-- FINANCIAL OS — Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  owner_type text not null default 'individual' check (owner_type in ('individual','company','other')),
  description text,
  currency text not null default 'MGA',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_type text not null default 'cash',
  currency text not null default 'MGA',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_storages (
  owner_id uuid not null references public.owners(id) on delete cascade,
  storage_id uuid not null references public.storages(id) on delete cascade,
  ownership_percentage numeric(7,3),
  created_at timestamptz not null default now(),
  primary key (owner_id, storage_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#8A7665',
  icon text default '●',
  category_type text not null default 'both' check (category_type in ('income','expense','both')),
  parent_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid references public.owners(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  source_storage_id uuid references public.storages(id) on delete set null,
  destination_storage_id uuid references public.storages(id) on delete set null,
  counterparty_owner_id uuid references public.owners(id) on delete set null,
  amount numeric(18,2) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('income','expense','transfer','loan','gift')),
  reason text not null,
  description text,
  transaction_date date not null default current_date,
  status text not null default 'completed' check (status in ('completed','planned','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lender_owner_id uuid not null references public.owners(id) on delete restrict,
  borrower_owner_id uuid not null references public.owners(id) on delete restrict,
  source_storage_id uuid references public.storages(id) on delete set null,
  destination_storage_id uuid references public.storages(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  principal_amount numeric(18,2) not null check (principal_amount > 0),
  repaid_amount numeric(18,2) not null default 0 check (repaid_amount >= 0),
  loan_date date not null default current_date,
  due_date date,
  reason text,
  status text not null default 'active' check (status in ('active','partially_paid','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid references public.owners(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  source_storage_id uuid references public.storages(id) on delete set null,
  destination_storage_id uuid references public.storages(id) on delete set null,
  amount numeric(18,2) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('income','expense','transfer','loan','gift')),
  reason text not null,
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly','custom')),
  interval_count integer not null default 1 check (interval_count > 0),
  start_date date not null,
  end_date date,
  day_of_month integer check (day_of_month between 1 and 31),
  day_of_week integer check (day_of_week between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_owners_user on public.owners(user_id);
create index if not exists idx_storages_user on public.storages(user_id);
create index if not exists idx_categories_user on public.categories(user_id);
create index if not exists idx_transactions_user_date on public.transactions(user_id, transaction_date desc);
create index if not exists idx_transactions_owner on public.transactions(owner_id);
create index if not exists idx_transactions_source on public.transactions(source_storage_id);
create index if not exists idx_transactions_destination on public.transactions(destination_storage_id);
create index if not exists idx_recurring_user on public.recurring_rules(user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists owners_updated_at on public.owners;
create trigger owners_updated_at before update on public.owners for each row execute function public.set_updated_at();
drop trigger if exists storages_updated_at on public.storages;
create trigger storages_updated_at before update on public.storages for each row execute function public.set_updated_at();
drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
drop trigger if exists loans_updated_at on public.loans;
create trigger loans_updated_at before update on public.loans for each row execute function public.set_updated_at();
drop trigger if exists recurring_updated_at on public.recurring_rules;
create trigger recurring_updated_at before update on public.recurring_rules for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.owners enable row level security;
alter table public.storages enable row level security;
alter table public.owner_storages enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.loans enable row level security;
alter table public.recurring_rules enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists owners_self on public.owners;
create policy owners_self on public.owners for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists storages_self on public.storages;
create policy storages_self on public.storages for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists categories_self on public.categories;
create policy categories_self on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transactions_self on public.transactions;
create policy transactions_self on public.transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists loans_self on public.loans;
create policy loans_self on public.loans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists recurring_self on public.recurring_rules;
create policy recurring_self on public.recurring_rules for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists owner_storages_owner on public.owner_storages;
create policy owner_storages_owner on public.owner_storages for all
using (
  exists (select 1 from public.owners o where o.id = owner_id and o.user_id = auth.uid())
  and exists (select 1 from public.storages s where s.id = storage_id and s.user_id = auth.uid())
)
with check (
  exists (select 1 from public.owners o where o.id = owner_id and o.user_id = auth.uid())
  and exists (select 1 from public.storages s where s.id = storage_id and s.user_id = auth.uid())
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace view public.storage_balances as
select
  s.id as storage_id,
  s.user_id,
  s.name,
  s.currency,
  coalesce(sum(case
    when t.status <> 'cancelled' and t.transaction_type = 'income' and t.destination_storage_id = s.id then t.amount
    when t.status <> 'cancelled' and t.transaction_type = 'expense' and t.source_storage_id = s.id then -t.amount
    when t.status <> 'cancelled' and t.transaction_type in ('transfer','loan','gift') and t.destination_storage_id = s.id then t.amount
    when t.status <> 'cancelled' and t.transaction_type in ('transfer','loan','gift') and t.source_storage_id = s.id then -t.amount
    else 0 end),0) as balance
from public.storages s
left join public.transactions t
  on t.user_id = s.user_id
 and (t.source_storage_id = s.id or t.destination_storage_id = s.id)
group by s.id, s.user_id, s.name, s.currency;

grant select on public.storage_balances to authenticated;
