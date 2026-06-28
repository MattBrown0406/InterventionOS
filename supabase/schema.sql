-- InterventionOS cloud + Telegram/Hermes assistant access layer
-- Keeps private family/intervention data in Supabase with RLS, while allowing
-- a server-side Edge Function to expose a narrow audited command API for Hermes.

create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'intervention' check (type in ('intervention', 'coaching')),
  status text not null default 'New',
  ip_name text,
  primary_substance text,
  meta text,
  participants jsonb not null default '[]'::jsonb,
  contact text,
  notes text,
  focus text,
  documents jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  amount numeric(12, 2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'received')),
  archived boolean not null default false,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.families add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.families add column if not exists ip_name text;
alter table public.families add column if not exists primary_substance text;
alter table public.families add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.families add column if not exists checklist jsonb not null default '{}'::jsonb;
alter table public.families add column if not exists local_id text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'families'
      and column_name = 'participants'
      and data_type <> 'jsonb'
  ) then
    alter table public.families
      alter column participants type jsonb
      using case
        when participants is null or trim(participants::text) = '' then '[]'::jsonb
        else participants::jsonb
      end;
  end if;
end $$;

alter table public.families alter column participants set default '[]'::jsonb;
alter table public.families alter column participants set not null;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  storage_path text,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.documents add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  family_name text,
  item_date date,
  item_time text,
  starts_at timestamptz,
  note text,
  google_event_id text,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_items add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.schedule_items add column if not exists item_date date;
alter table public.schedule_items add column if not exists item_time text;
alter table public.schedule_items add column if not exists local_id text;
alter table public.schedule_items add column if not exists updated_at timestamptz not null default now();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  family_name text,
  due_date date,
  note text,
  completed boolean not null default false,
  google_event_id text,
  local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.tasks add column if not exists family_name text;
alter table public.tasks add column if not exists note text;
alter table public.tasks add column if not exists local_id text;
alter table public.tasks add column if not exists updated_at timestamptz not null default now();

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'hermes_telegram',
  action text not null,
  target_table text,
  target_id uuid,
  request jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at
before update on public.families
for each row execute function public.set_updated_at();

drop trigger if exists schedule_items_set_updated_at on public.schedule_items;
create trigger schedule_items_set_updated_at
before update on public.schedule_items
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create index if not exists families_owner_archived_idx on public.families(owner_id, archived, type);
create unique index if not exists families_owner_local_id_key on public.families(owner_id, local_id);
create index if not exists schedule_items_owner_date_idx on public.schedule_items(owner_id, item_date);
create unique index if not exists schedule_items_owner_local_id_key on public.schedule_items(owner_id, local_id);
create index if not exists tasks_owner_due_idx on public.tasks(owner_id, due_date, completed);
create unique index if not exists tasks_owner_local_id_key on public.tasks(owner_id, local_id);
create index if not exists agent_actions_created_at_idx on public.agent_actions(created_at desc);

alter table public.families enable row level security;
alter table public.documents enable row level security;
alter table public.schedule_items enable row level security;
alter table public.tasks enable row level security;
alter table public.agent_actions enable row level security;

-- Authenticated app users can only see and change their own InterventionOS rows.
drop policy if exists "families owner select" on public.families;
create policy "families owner select" on public.families for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "families owner insert" on public.families;
create policy "families owner insert" on public.families for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "families owner update" on public.families;
create policy "families owner update" on public.families for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "families owner delete" on public.families;
create policy "families owner delete" on public.families for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "documents owner all" on public.documents;
create policy "documents owner all" on public.documents for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "schedule owner all" on public.schedule_items;
create policy "schedule owner all" on public.schedule_items for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists "tasks owner all" on public.tasks;
create policy "tasks owner all" on public.tasks for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Agent audit rows are written by the Edge Function's service-role client only.
-- No direct client access policy is intentionally provided.

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;
