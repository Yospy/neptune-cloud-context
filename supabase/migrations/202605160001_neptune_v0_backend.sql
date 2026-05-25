create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  provider text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id, slug)
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  default_workstream text,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create table if not exists public.contexts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  summary text not null,
  content_md text not null,
  content_hash text not null,
  source_workstream text not null,
  target_workstreams text[] not null,
  domain text not null,
  code_areas text[] not null default '{}',
  context_type text not null,
  priority text not null default 'normal',
  status text not null default 'active',
  repo_paths text[] not null default '{}',
  related_files text[] not null default '{}',
  tags text[] not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  valid_from timestamptz,
  expires_at timestamptz,
  version int not null default 1,
  confidence_score numeric,
  inference_notes text,
  resolved_at timestamptz,
  superseded_by uuid references public.contexts(id),
  unique(project_id, title),
  check (source_workstream in ('frontend', 'backend', 'mobile', 'infra', 'design', 'qa', 'data', 'docs', 'general')),
  check (context_type in ('api_contract', 'ui_contract', 'implementation_note', 'decision', 'migration', 'bug_context', 'setup_note', 'requirement', 'general_context')),
  check (priority in ('low', 'normal', 'high', 'blocking')),
  check (status in ('draft', 'active', 'resolved', 'superseded', 'archived')),
  check (version > 0)
);

create table if not exists public.context_versions (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.contexts(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version int not null,
  content_md text not null,
  content_hash text not null,
  metadata jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(context_id, version)
);

create table if not exists public.context_reads (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.contexts(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null default 'neptune',
  read_at timestamptz not null default now(),
  unique(context_id, user_id, agent_name)
);

create table if not exists public.context_references (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.contexts(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null default 'neptune',
  note text,
  repo_path text,
  git_commit text,
  referenced_at timestamptz not null default now()
);

create table if not exists public.context_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  context_id uuid references public.contexts(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_project_members_user_project on public.project_members(user_id, project_id);
create index if not exists idx_contexts_relevant on public.contexts(project_id, status, domain, updated_at desc);
create index if not exists idx_contexts_target_workstreams on public.contexts using gin(target_workstreams);
create index if not exists idx_contexts_code_areas on public.contexts using gin(code_areas);
create index if not exists idx_context_reads_user on public.context_reads(user_id, context_id);
create index if not exists idx_context_references_context on public.context_references(context_id, referenced_at desc);
create index if not exists idx_context_events_context on public.context_events(context_id, created_at desc);
create unique index if not exists idx_user_profiles_email_lower
on public.user_profiles (lower(email))
where email is not null;

create or replace function public.neptune_sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    display_name,
    avatar_url,
    provider,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    nullif(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name'
    ), ''),
    nullif(coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ), ''),
    nullif(coalesce(
      new.raw_app_meta_data->>'provider',
      new.raw_user_meta_data->>'provider'
    ), ''),
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, user_profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, user_profiles.avatar_url),
    provider = coalesce(excluded.provider, user_profiles.provider),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_neptune_profile_sync on auth.users;
create trigger on_auth_user_neptune_profile_sync
after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function public.neptune_sync_auth_user_profile();

insert into public.user_profiles (
  id,
  email,
  display_name,
  avatar_url,
  provider,
  created_at,
  updated_at
)
select
  id,
  email,
  nullif(coalesce(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    raw_user_meta_data->>'user_name'
  ), ''),
  nullif(coalesce(
    raw_user_meta_data->>'avatar_url',
    raw_user_meta_data->>'picture'
  ), ''),
  nullif(coalesce(
    raw_app_meta_data->>'provider',
    raw_user_meta_data->>'provider'
  ), ''),
  now(),
  now()
from auth.users
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(excluded.display_name, user_profiles.display_name),
  avatar_url = coalesce(excluded.avatar_url, user_profiles.avatar_url),
  provider = coalesce(excluded.provider, user_profiles.provider),
  updated_at = now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orgs_owner_user_id_user_profiles_fkey'
  ) then
    alter table public.orgs
      add constraint orgs_owner_user_id_user_profiles_fkey
      foreign key (owner_user_id) references public.user_profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'org_members_user_id_user_profiles_fkey'
  ) then
    alter table public.org_members
      add constraint org_members_user_id_user_profiles_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'projects_created_by_user_profiles_fkey'
  ) then
    alter table public.projects
      add constraint projects_created_by_user_profiles_fkey
      foreign key (created_by) references public.user_profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'project_members_user_id_user_profiles_fkey'
  ) then
    alter table public.project_members
      add constraint project_members_user_id_user_profiles_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'contexts_created_by_user_profiles_fkey'
  ) then
    alter table public.contexts
      add constraint contexts_created_by_user_profiles_fkey
      foreign key (created_by) references public.user_profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'context_versions_created_by_user_profiles_fkey'
  ) then
    alter table public.context_versions
      add constraint context_versions_created_by_user_profiles_fkey
      foreign key (created_by) references public.user_profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'context_reads_user_id_user_profiles_fkey'
  ) then
    alter table public.context_reads
      add constraint context_reads_user_id_user_profiles_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'context_references_user_id_user_profiles_fkey'
  ) then
    alter table public.context_references
      add constraint context_references_user_id_user_profiles_fkey
      foreign key (user_id) references public.user_profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'context_events_actor_user_id_user_profiles_fkey'
  ) then
    alter table public.context_events
      add constraint context_events_actor_user_id_user_profiles_fkey
      foreign key (actor_user_id) references public.user_profiles(id) on delete restrict;
  end if;
end $$;

drop trigger if exists set_orgs_updated_at on public.orgs;
create trigger set_orgs_updated_at
before update on public.orgs
for each row execute function public.set_updated_at();

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_contexts_updated_at on public.contexts;
create trigger set_contexts_updated_at
before update on public.contexts
for each row execute function public.set_updated_at();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members
    where org_id = target_org_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members
    where project_id = target_project_id
      and user_id = auth.uid()
  );
$$;

alter table public.orgs enable row level security;
alter table public.user_profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.contexts enable row level security;
alter table public.context_versions enable row level security;
alter table public.context_reads enable row level security;
alter table public.context_references enable row level security;
alter table public.context_events enable row level security;

drop policy if exists orgs_member_access on public.orgs;
create policy orgs_member_access on public.orgs
for all using (public.is_org_member(id))
with check (owner_user_id = auth.uid() or public.is_org_member(id));

drop policy if exists user_profiles_self_read on public.user_profiles;
create policy user_profiles_self_read on public.user_profiles
for select using (id = auth.uid());

drop policy if exists org_members_member_access on public.org_members;
create policy org_members_member_access on public.org_members
for all using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

drop policy if exists projects_member_access on public.projects;
create policy projects_member_access on public.projects
for all using (public.is_project_member(id))
with check (public.is_org_member(org_id));

drop policy if exists project_members_member_access on public.project_members;
create policy project_members_member_access on public.project_members
for all using (public.is_project_member(project_id))
with check (public.is_org_member(org_id));

drop policy if exists contexts_member_access on public.contexts;
create policy contexts_member_access on public.contexts
for all using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

drop policy if exists context_versions_member_access on public.context_versions;
create policy context_versions_member_access on public.context_versions
for all using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

drop policy if exists context_reads_member_access on public.context_reads;
create policy context_reads_member_access on public.context_reads
for all using (public.is_project_member(project_id))
with check (public.is_project_member(project_id) and user_id = auth.uid());

drop policy if exists context_references_member_access on public.context_references;
create policy context_references_member_access on public.context_references
for all using (public.is_project_member(project_id))
with check (public.is_project_member(project_id) and user_id = auth.uid());

drop policy if exists context_events_member_access on public.context_events;
create policy context_events_member_access on public.context_events
for all using (public.is_project_member(project_id))
with check (public.is_project_member(project_id));

create or replace function public.neptune_create_org(
  p_actor_user_id uuid,
  p_slug text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.orgs%rowtype;
begin
  insert into public.orgs (slug, name, owner_user_id)
  values (p_slug, p_name, p_actor_user_id)
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org.id, p_actor_user_id, 'owner');

  return jsonb_build_object(
    'ok', true,
    'org', jsonb_build_object(
      'id', v_org.id,
      'slug', v_org.slug,
      'name', v_org.name,
      'role', 'owner',
      'created_at', v_org.created_at
    )
  );
end;
$$;

create or replace function public.neptune_create_project(
  p_actor_user_id uuid,
  p_org_id uuid,
  p_slug text,
  p_name text,
  p_default_workstream text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
begin
  if not exists (select 1 from public.orgs where id = p_org_id) then
    raise exception 'ORG_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.org_members
    where org_id = p_org_id
      and user_id = p_actor_user_id
  ) then
    raise exception 'ORG_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  insert into public.projects (org_id, slug, name, created_by)
  values (p_org_id, p_slug, p_name, p_actor_user_id)
  returning * into v_project;

  insert into public.project_members (
    org_id,
    project_id,
    user_id,
    role,
    default_workstream
  )
  values (
    p_org_id,
    v_project.id,
    p_actor_user_id,
    'admin',
    coalesce(p_default_workstream, 'general')
  );

  return jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'id', v_project.id,
      'org_id', v_project.org_id,
      'slug', v_project.slug,
      'name', v_project.name,
      'role', 'admin',
      'default_workstream', coalesce(p_default_workstream, 'general'),
      'created_at', v_project.created_at
    )
  );
end;
$$;

create or replace function public.neptune_upsert_context(
  p_actor_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid := (p_payload->>'project_id')::uuid;
  v_content_hash text := p_payload->>'content_hash';
  v_project record;
  v_existing public.contexts%rowtype;
  v_context public.contexts%rowtype;
  v_next_version int;
  v_changed boolean;
begin
  select
    p.id as project_id,
    p.org_id,
    p.slug as project_slug,
    o.slug as org_slug
  into v_project
  from public.projects p
  join public.orgs o on o.id = p.org_id
  where p.id = v_project_id;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.project_members
    where project_id = v_project_id
      and user_id = p_actor_user_id
  ) then
    raise exception 'PROJECT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  select *
  into v_existing
  from public.contexts
  where project_id = v_project_id
    and title = p_payload->>'title';

  if found and v_existing.content_hash = v_content_hash then
    insert into public.context_events (
      org_id,
      project_id,
      context_id,
      actor_user_id,
      event_type,
      payload
    )
    values (
      v_project.org_id,
      v_project.project_id,
      v_existing.id,
      p_actor_user_id,
      'context.unchanged',
      jsonb_build_object('content_hash', v_content_hash, 'version', v_existing.version)
    );

    v_context := v_existing;
    v_changed := false;
  elsif found then
    v_next_version := v_existing.version + 1;

    update public.contexts
    set
      summary = p_payload->>'summary',
      content_md = p_payload->>'content_md',
      content_hash = v_content_hash,
      source_workstream = p_payload->>'source_workstream',
      target_workstreams = coalesce(
        array(select jsonb_array_elements_text(p_payload->'target_workstreams')),
        array[]::text[]
      ),
      domain = p_payload->>'domain',
      code_areas = coalesce(
        array(select jsonb_array_elements_text(p_payload->'code_areas')),
        array[]::text[]
      ),
      context_type = p_payload->>'context_type',
      priority = coalesce(p_payload->>'priority', 'normal'),
      status = 'active',
      repo_paths = coalesce(
        array(select jsonb_array_elements_text(p_payload->'repo_paths')),
        array[]::text[]
      ),
      related_files = coalesce(
        array(select jsonb_array_elements_text(p_payload->'related_files')),
        array[]::text[]
      ),
      tags = coalesce(
        array(select jsonb_array_elements_text(p_payload->'tags')),
        array[]::text[]
      ),
      confidence_score = nullif(p_payload->>'confidence_score', '')::numeric,
      inference_notes = p_payload->>'inference_notes',
      version = v_next_version,
      resolved_at = null,
      superseded_by = null
    where id = v_existing.id
    returning * into v_context;

    insert into public.context_versions (
      context_id,
      org_id,
      project_id,
      version,
      content_md,
      content_hash,
      metadata,
      created_by
    )
    values (
      v_context.id,
      v_context.org_id,
      v_context.project_id,
      v_context.version,
      v_context.content_md,
      v_context.content_hash,
      p_payload - 'content_md',
      p_actor_user_id
    );

    insert into public.context_events (
      org_id,
      project_id,
      context_id,
      actor_user_id,
      event_type,
      payload
    )
    values (
      v_project.org_id,
      v_project.project_id,
      v_context.id,
      p_actor_user_id,
      'context.updated',
      jsonb_build_object('content_hash', v_content_hash, 'version', v_context.version)
    );

    v_changed := true;
  else
    insert into public.contexts (
      org_id,
      project_id,
      title,
      summary,
      content_md,
      content_hash,
      source_workstream,
      target_workstreams,
      domain,
      code_areas,
      context_type,
      priority,
      status,
      repo_paths,
      related_files,
      tags,
      confidence_score,
      inference_notes,
      created_by,
      version
    )
    values (
      v_project.org_id,
      v_project.project_id,
      p_payload->>'title',
      p_payload->>'summary',
      p_payload->>'content_md',
      v_content_hash,
      p_payload->>'source_workstream',
      coalesce(array(select jsonb_array_elements_text(p_payload->'target_workstreams')), array[]::text[]),
      p_payload->>'domain',
      coalesce(array(select jsonb_array_elements_text(p_payload->'code_areas')), array[]::text[]),
      p_payload->>'context_type',
      coalesce(p_payload->>'priority', 'normal'),
      'active',
      coalesce(array(select jsonb_array_elements_text(p_payload->'repo_paths')), array[]::text[]),
      coalesce(array(select jsonb_array_elements_text(p_payload->'related_files')), array[]::text[]),
      coalesce(array(select jsonb_array_elements_text(p_payload->'tags')), array[]::text[]),
      nullif(p_payload->>'confidence_score', '')::numeric,
      p_payload->>'inference_notes',
      p_actor_user_id,
      1
    )
    returning * into v_context;

    insert into public.context_versions (
      context_id,
      org_id,
      project_id,
      version,
      content_md,
      content_hash,
      metadata,
      created_by
    )
    values (
      v_context.id,
      v_context.org_id,
      v_context.project_id,
      v_context.version,
      v_context.content_md,
      v_context.content_hash,
      p_payload - 'content_md',
      p_actor_user_id
    );

    insert into public.context_events (
      org_id,
      project_id,
      context_id,
      actor_user_id,
      event_type,
      payload
    )
    values (
      v_project.org_id,
      v_project.project_id,
      v_context.id,
      p_actor_user_id,
      'context.created',
      jsonb_build_object('content_hash', v_content_hash, 'version', v_context.version)
    );

    v_changed := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'receipt', jsonb_build_object(
      'context_id', v_context.id,
      'org', v_project.org_slug,
      'project', v_project.project_slug,
      'title', v_context.title,
      'source_workstream', v_context.source_workstream,
      'target_workstreams', v_context.target_workstreams,
      'domain', v_context.domain,
      'code_areas', v_context.code_areas,
      'context_type', v_context.context_type,
      'status', v_context.status,
      'version', v_context.version,
      'created_at', v_context.created_at,
      'content_hash', v_context.content_hash
    )
  );
end;
$$;

create or replace function public.neptune_reference_context(
  p_actor_user_id uuid,
  p_context_id uuid,
  p_agent_name text,
  p_note text,
  p_repo_path text,
  p_git_commit text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context public.contexts%rowtype;
begin
  select * into v_context
  from public.contexts
  where id = p_context_id;

  if not found then
    raise exception 'CONTEXT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.project_members
    where project_id = v_context.project_id
      and user_id = p_actor_user_id
  ) then
    raise exception 'PROJECT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  insert into public.context_references (
    context_id,
    org_id,
    project_id,
    user_id,
    agent_name,
    note,
    repo_path,
    git_commit
  )
  values (
    v_context.id,
    v_context.org_id,
    v_context.project_id,
    p_actor_user_id,
    coalesce(p_agent_name, 'neptune'),
    p_note,
    p_repo_path,
    p_git_commit
  );

  insert into public.context_events (
    org_id,
    project_id,
    context_id,
    actor_user_id,
    event_type,
    payload
  )
  values (
    v_context.org_id,
    v_context.project_id,
    v_context.id,
    p_actor_user_id,
    'context.referenced',
    jsonb_build_object(
      'agent_name', coalesce(p_agent_name, 'neptune'),
      'note', p_note,
      'repo_path', p_repo_path,
      'git_commit', p_git_commit
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.neptune_resolve_context(
  p_actor_user_id uuid,
  p_context_id uuid,
  p_agent_name text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context public.contexts%rowtype;
begin
  select * into v_context
  from public.contexts
  where id = p_context_id;

  if not found then
    raise exception 'CONTEXT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.project_members
    where project_id = v_context.project_id
      and user_id = p_actor_user_id
  ) then
    raise exception 'PROJECT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  update public.contexts
  set status = 'resolved',
      resolved_at = now()
  where id = v_context.id
  returning * into v_context;

  insert into public.context_events (
    org_id,
    project_id,
    context_id,
    actor_user_id,
    event_type,
    payload
  )
  values (
    v_context.org_id,
    v_context.project_id,
    v_context.id,
    p_actor_user_id,
    'context.resolved',
    jsonb_build_object('agent_name', coalesce(p_agent_name, 'neptune'), 'note', p_note)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.neptune_create_org(uuid, text, text) from anon, authenticated;
revoke all on function public.neptune_create_project(uuid, uuid, text, text, text) from anon, authenticated;
revoke all on function public.neptune_upsert_context(uuid, jsonb) from anon, authenticated;
revoke all on function public.neptune_reference_context(uuid, uuid, text, text, text, text) from anon, authenticated;
revoke all on function public.neptune_resolve_context(uuid, uuid, text, text) from anon, authenticated;

grant execute on function public.neptune_create_org(uuid, text, text) to service_role;
grant execute on function public.neptune_create_project(uuid, uuid, text, text, text) to service_role;
grant execute on function public.neptune_upsert_context(uuid, jsonb) to service_role;
grant execute on function public.neptune_reference_context(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.neptune_resolve_context(uuid, uuid, text, text) to service_role;

alter table public.context_reads
alter column agent_name set default 'neptune';

alter table public.context_references
alter column agent_name set default 'neptune';

drop trigger if exists on_auth_user_agentctx_profile_sync on auth.users;

drop function if exists public.agentctx_sync_auth_user_profile();
drop function if exists public.agentctx_create_org(uuid, text, text);
drop function if exists public.agentctx_create_project(uuid, uuid, text, text, text);
drop function if exists public.agentctx_upsert_context(uuid, jsonb);
drop function if exists public.agentctx_reference_context(uuid, uuid, text, text, text, text);
drop function if exists public.agentctx_resolve_context(uuid, uuid, text, text);

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
