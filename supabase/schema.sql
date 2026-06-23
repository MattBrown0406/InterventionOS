create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('intervention', 'coaching')),
  status text not null default 'New',
  meta text,
  participants text,
  contact text,
  notes text,
  focus text,
  amount numeric(12, 2) not null default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'received')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  storage_path text,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  family_name text,
  starts_at timestamptz,
  note text,
  google_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  completed boolean not null default false,
  google_event_id text,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;
