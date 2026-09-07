-- Baseline Supabase schema for Colombian Contractor.
-- This records the setup originally applied through the Supabase dashboard.
-- It is idempotent for the current project and can be used for a fresh project.

create table if not exists public.months (
  user_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null check (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sources jsonb not null default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  result jsonb,
  ibc_final bigint not null default 0,
  total_contributions bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, year_month)
);

create table if not exists public.year_params (
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  params jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);

create table if not exists public.trm_quotes (
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_date date not null,
  quote jsonb not null,
  primary key (user_id, quote_date)
);

create table if not exists public.trm_months (
  user_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null check (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  primary key (user_id, year_month)
);

alter table public.months enable row level security;
alter table public.year_params enable row level security;
alter table public.trm_quotes enable row level security;
alter table public.trm_months enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'months'
      and policyname = 'Users can access their own months'
  ) then
    create policy "Users can access their own months"
      on public.months for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'year_params'
      and policyname = 'Users can access their own year parameters'
  ) then
    create policy "Users can access their own year parameters"
      on public.year_params for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trm_quotes'
      and policyname = 'Users can access their own TRM quotes'
  ) then
    create policy "Users can access their own TRM quotes"
      on public.trm_quotes for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trm_months'
      and policyname = 'Users can access their own TRM month markers'
  ) then
    create policy "Users can access their own TRM month markers"
      on public.trm_months for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists months_updated_at on public.months;
create trigger months_updated_at
before update on public.months
for each row execute function public.set_updated_at();

drop trigger if exists year_params_updated_at on public.year_params;
create trigger year_params_updated_at
before update on public.year_params
for each row execute function public.set_updated_at();
