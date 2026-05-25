# Supabase Database Schema

## Purpose

Supabase stores auth users, orgs, projects, memberships, context files, versions, reads, references, and audit events.

The database must enforce:

```text
org isolation
project isolation
context routing
traceability
```

## Connection Placeholders

Supabase connection config is supplied through environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is only for server-side migrations, admin checks, and backend operations that cannot run under the user's RLS-scoped session.

## Tables

```text
auth.users
user_profiles

orgs
org_members

projects
project_members

contexts
context_versions
context_reads
context_references
context_events
```

Planned later:

```text
org_invites
project_invites
org_allowed_domains
project_git_remotes
```

## user_profiles

Product-facing user records synced from Supabase Auth.

```text
id uuid primary key references auth.users(id)
email text
display_name text
avatar_url text
provider text
last_seen_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique lower(email) where email is not null
```

Sync sources:

```text
Supabase auth.users trigger
backend protected request middleware
```

## orgs

```text
id uuid primary key
slug text unique not null
name text not null
owner_user_id uuid not null references auth.users(id)
owner_user_id also references user_profiles(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## org_members

```text
id uuid primary key
org_id uuid not null references orgs(id)
user_id uuid not null references auth.users(id)
user_id also references user_profiles(id)
role text not null check (role in ('owner', 'admin', 'member'))
created_at timestamptz not null default now()
unique(org_id, user_id)
```

## projects

```text
id uuid primary key
org_id uuid not null references orgs(id)
slug text not null
name text not null
created_by uuid not null references auth.users(id)
created_by also references user_profiles(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(org_id, slug)
```

## project_members

```text
id uuid primary key
org_id uuid not null references orgs(id)
project_id uuid not null references projects(id)
user_id uuid not null references auth.users(id)
user_id also references user_profiles(id)
role text not null check (role in ('admin', 'editor', 'viewer'))
default_workstream text
created_at timestamptz not null default now()
unique(project_id, user_id)
```

## contexts

The main routed context record.

```text
id uuid primary key
org_id uuid not null references orgs(id)
project_id uuid not null references projects(id)

title text not null
summary text not null
content_md text not null
content_hash text not null

source_workstream text not null
target_workstreams text[] not null
domain text not null
code_areas text[] not null default '{}'
context_type text not null
priority text not null default 'normal'
status text not null default 'active'

repo_paths text[] not null default '{}'
related_files text[] not null default '{}'
tags text[] not null default '{}'

created_by uuid not null references auth.users(id)
created_by also references user_profiles(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
valid_from timestamptz
expires_at timestamptz

version int not null default 1
confidence_score numeric
inference_notes text

resolved_at timestamptz
superseded_by uuid references contexts(id)
```

## context_versions

```text
id uuid primary key
context_id uuid not null references contexts(id)
org_id uuid not null references orgs(id)
project_id uuid not null references projects(id)
version int not null
content_md text not null
content_hash text not null
metadata jsonb not null
created_by uuid not null references auth.users(id)
created_by also references user_profiles(id)
created_at timestamptz not null default now()
unique(context_id, version)
```

## context_reads

```text
id uuid primary key
context_id uuid not null references contexts(id)
org_id uuid not null references orgs(id)
project_id uuid not null references projects(id)
user_id uuid not null references auth.users(id)
user_id also references user_profiles(id)
agent_name text not null default 'neptune'
read_at timestamptz not null default now()
unique(context_id, user_id, agent_name)
```

## context_references

```text
id uuid primary key
context_id uuid not null references contexts(id)
org_id uuid not null references orgs(id)
project_id uuid not null references projects(id)
user_id uuid not null references auth.users(id)
user_id also references user_profiles(id)
agent_name text not null default 'neptune'
note text
repo_path text
git_commit text
referenced_at timestamptz not null default now()
```

## context_events

```text
id uuid primary key
org_id uuid not null references orgs(id)
project_id uuid not null references projects(id)
context_id uuid references contexts(id)
actor_user_id uuid not null references auth.users(id)
actor_user_id also references user_profiles(id)
event_type text not null
payload jsonb not null default '{}'
created_at timestamptz not null default now()
```

## RLS Rules

Required rule for every org-scoped table:

```text
User can access row only if user is in org_members for row.org_id.
```

Required rule for every project-scoped table:

```text
User can access row only if user is in project_members for row.project_id.
```

Backend API must also check permissions before writes. RLS is the database backstop, not the only control.

## RPC Functions

Live DB uses Neptune-prefixed server-side RPCs:

```text
neptune_sync_auth_user_profile
neptune_create_org
neptune_create_project
neptune_upsert_context
neptune_reference_context
neptune_resolve_context
```

The old `agentctx_*` functions have been removed from the live DB.

## Query Patterns

Latest context for backend auth:

```sql
select *
from contexts
where project_id = :project_id
  and 'backend' = any(target_workstreams)
  and domain = 'auth'
  and status = 'active'
order by updated_at desc
limit 5;
```

Unread context for current user:

```sql
select c.*
from contexts c
where c.project_id = :project_id
  and :workstream = any(c.target_workstreams)
  and c.status = 'active'
  and not exists (
    select 1
    from context_reads r
    where r.context_id = c.id
      and r.user_id = :user_id
  )
order by c.updated_at desc;
```
