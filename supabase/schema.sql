-- BENISAT · Supabase foundation
-- Apply this file in the Supabase SQL Editor for a NEW, empty project.
-- Access is granted only to active team members. Editors/admins can write; viewers are read-only.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 140),
  priority text not null default 'media' check (priority in ('alta', 'media', 'baja')),
  area text not null default 'General',
  due date,
  done boolean not null default false,
  created_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.milestones (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 100),
  date date,
  note text not null default '',
  fixed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.documents (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 140),
  type text not null default 'Otro',
  status text not null default 'Pendiente'
    check (status in ('Pendiente', 'En curso', 'Revisado', 'Finalizado')),
  url text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.scientific_notes (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 100),
  body text not null check (length(trim(body)) between 1 and 2000),
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.expenses (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 120),
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('gasto', 'ingreso')),
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.posts (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 140),
  status text not null default 'Idea' check (status in ('Idea', 'Preparando', 'Publicado')),
  date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- SECURITY DEFINER helpers avoid recursive RLS checks on team_members.
create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.active = true
  );
$$;

create or replace function public.current_team_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select tm.role
  from public.team_members tm
  where tm.user_id = (select auth.uid())
    and tm.active = true
  limit 1;
$$;

create or replace function public.set_updated_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- Enable RLS on every exposed table.
alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
alter table public.milestones enable row level security;
alter table public.documents enable row level security;
alter table public.scientific_notes enable row level security;
alter table public.expenses enable row level security;
alter table public.posts enable row level security;

-- Membership directory: active members can view it; only admins can manage it.
drop policy if exists "team members can read membership" on public.team_members;
create policy "team members can read membership"
  on public.team_members for select to authenticated
  using (public.is_team_member());

drop policy if exists "admins can add membership" on public.team_members;
create policy "admins can add membership"
  on public.team_members for insert to authenticated
  with check (public.current_team_role() = 'admin');

drop policy if exists "admins can update membership" on public.team_members;
create policy "admins can update membership"
  on public.team_members for update to authenticated
  using (public.current_team_role() = 'admin')
  with check (public.current_team_role() = 'admin');

drop policy if exists "admins can remove membership" on public.team_members;
create policy "admins can remove membership"
  on public.team_members for delete to authenticated
  using (public.current_team_role() = 'admin');

-- Shared workspace data: all active members can read; editors/admins can create,
-- change and delete records. Viewers have no write policy.
do $policies$
declare
  table_name text;
begin
  foreach table_name in array array['tasks', 'milestones', 'documents', 'scientific_notes', 'expenses', 'posts']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || ' members can read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_team_member())',
      table_name || ' members can read', table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || ' editors can insert', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.current_team_role() in (''admin'', ''editor''))',
      table_name || ' editors can insert', table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || ' editors can update', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.current_team_role() in (''admin'', ''editor'')) with check (public.current_team_role() in (''admin'', ''editor''))',
      table_name || ' editors can update', table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || ' editors can delete', table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.current_team_role() in (''admin'', ''editor''))',
      table_name || ' editors can delete', table_name
    );

    execute format('drop trigger if exists set_updated_fields on public.%I', table_name);
    execute format(
      'create trigger set_updated_fields before update on public.%I for each row execute function public.set_updated_fields()',
      table_name
    );
  end loop;
end
$policies$;

-- No anonymous API access. RLS remains the authorization boundary for authenticated users.
revoke all on public.team_members, public.tasks, public.milestones, public.documents,
  public.scientific_notes, public.expenses, public.posts from anon;
grant select, insert, update, delete on public.team_members, public.tasks, public.milestones,
  public.documents, public.scientific_notes, public.expenses, public.posts to authenticated;
grant execute on function public.is_team_member() to authenticated;
grant execute on function public.current_team_role() to authenticated;
