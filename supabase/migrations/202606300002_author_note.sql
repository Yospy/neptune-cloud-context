alter table public.contexts
  add column if not exists author_note_md text,
  add column if not exists author_note_source text,
  add column if not exists author_note_updated_at timestamptz,
  add column if not exists author_note_updated_by uuid references auth.users(id);

alter table public.contexts
  drop constraint if exists contexts_author_note_source_check;

alter table public.contexts
  add constraint contexts_author_note_source_check
  check (author_note_source is null or author_note_source in ('manual', 'agent_inferred'));

alter table public.contexts
  drop constraint if exists contexts_author_note_consistency_check;

alter table public.contexts
  add constraint contexts_author_note_consistency_check
  check (
    (
      author_note_md is null
      and author_note_source is null
      and author_note_updated_at is null
      and author_note_updated_by is null
    )
    or (
      author_note_md is not null
      and author_note_source is not null
      and author_note_updated_at is not null
      and author_note_updated_by is not null
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contexts_author_note_updated_by_user_profiles_fkey'
  ) then
    alter table public.contexts
      add constraint contexts_author_note_updated_by_user_profiles_fkey
      foreign key (author_note_updated_by)
      references public.user_profiles(id);
  end if;
end $$;

drop function if exists public.neptune_list_relevant_context(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  int
);

drop function if exists public.neptune_retrieve_context(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  int
);

drop index if exists public.idx_contexts_search;

drop function if exists public.neptune_context_search_vector(
  text,
  text,
  text[],
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text
);

create or replace function public.neptune_context_search_vector(
  p_title text,
  p_author_note_md text,
  p_summary text,
  p_tags text[],
  p_domain text,
  p_context_type text,
  p_source_workstream text,
  p_target_workstreams text[],
  p_code_areas text[],
  p_repo_paths text[],
  p_content_md text
)
returns tsvector
language sql
immutable
parallel safe
set search_path = public
as $$
  select
    setweight(to_tsvector('english', coalesce(p_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_author_note_md, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_summary, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(coalesce(p_tags, '{}'), ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_domain, '')), 'B') ||
    setweight(to_tsvector('english', replace(coalesce(p_context_type, ''), '_', ' ')), 'C') ||
    setweight(to_tsvector('english', coalesce(p_source_workstream, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(coalesce(p_target_workstreams, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(coalesce(p_code_areas, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(coalesce(p_repo_paths, '{}'), ' ')), 'C') ||
    setweight(to_tsvector('english', coalesce(p_content_md, '')), 'D');
$$;

create index if not exists idx_contexts_search
on public.contexts using gin(public.neptune_context_search_vector(
  title,
  author_note_md,
  summary,
  tags,
  domain,
  context_type,
  source_workstream,
  target_workstreams,
  code_areas,
  repo_paths,
  content_md
));

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
  v_author_note_md text := nullif(trim(p_payload->>'author_note_md'), '');
  v_author_note_source text := nullif(trim(p_payload->>'author_note_source'), '');
  v_author_note_requested boolean := nullif(trim(coalesce(p_payload->>'author_note_md', '')), '') is not null;
  v_author_note_changed boolean := false;
  v_project record;
  v_existing public.contexts%rowtype;
  v_context public.contexts%rowtype;
  v_next_version int;
  v_changed boolean;
begin
  if v_author_note_requested and coalesce(v_author_note_source, '') not in ('manual', 'agent_inferred') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if not v_author_note_requested and v_author_note_source is not null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

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

  if found and v_author_note_requested and v_existing.created_by <> p_actor_user_id then
    raise exception 'AUTHOR_NOTE_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if found and v_author_note_requested then
    v_author_note_changed :=
      v_existing.author_note_md is distinct from v_author_note_md
      or v_existing.author_note_source is distinct from v_author_note_source;
  elsif not found and v_author_note_requested then
    v_author_note_changed := true;
  end if;

  if found and v_existing.content_hash = v_content_hash then
    if v_author_note_changed then
      update public.contexts
      set
        author_note_md = v_author_note_md,
        author_note_source = v_author_note_source,
        author_note_updated_at = now(),
        author_note_updated_by = p_actor_user_id
      where id = v_existing.id
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
        v_project.org_id,
        v_project.project_id,
        v_context.id,
        p_actor_user_id,
        'context.author_note.updated',
        jsonb_build_object('author_note_source', v_author_note_source)
      );

      v_changed := true;
    else
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
    end if;
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
      superseded_by = null,
      author_note_md = case when v_author_note_requested then v_author_note_md else author_note_md end,
      author_note_source = case when v_author_note_requested then v_author_note_source else author_note_source end,
      author_note_updated_at = case when v_author_note_requested then now() else author_note_updated_at end,
      author_note_updated_by = case when v_author_note_requested then p_actor_user_id else author_note_updated_by end
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

    if v_author_note_changed then
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
        'context.author_note.updated',
        jsonb_build_object('author_note_source', v_author_note_source)
      );
    end if;

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
      version,
      author_note_md,
      author_note_source,
      author_note_updated_at,
      author_note_updated_by
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
      1,
      v_author_note_md,
      v_author_note_source,
      case when v_author_note_requested then now() else null end,
      case when v_author_note_requested then p_actor_user_id else null end
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
      jsonb_build_object(
        'content_hash',
        v_content_hash,
        'version',
        v_context.version,
        'author_note_source',
        v_context.author_note_source
      )
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
      'content_hash', v_context.content_hash,
      'author_note_md', v_context.author_note_md,
      'author_note_source', v_context.author_note_source,
      'author_note_updated_at', v_context.author_note_updated_at,
      'author_note_updated_by', v_context.author_note_updated_by
    )
  );
end;
$$;

create or replace function public.neptune_update_context_author_note(
  p_actor_user_id uuid,
  p_context_id uuid,
  p_author_note_md text,
  p_author_note_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context public.contexts%rowtype;
  v_author_note_md text := nullif(trim(p_author_note_md), '');
begin
  if v_author_note_md is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if coalesce(p_author_note_source, '') not in ('manual', 'agent_inferred') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

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

  if v_context.created_by <> p_actor_user_id then
    raise exception 'AUTHOR_NOTE_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  update public.contexts
  set
    author_note_md = v_author_note_md,
    author_note_source = p_author_note_source,
    author_note_updated_at = now(),
    author_note_updated_by = p_actor_user_id
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
    'context.author_note.updated',
    jsonb_build_object('author_note_source', p_author_note_source)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.neptune_list_relevant_context(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_target_workstream text,
  p_query text default null,
  p_domain text default null,
  p_code_area text default null,
  p_context_type text default null,
  p_updated_after timestamptz default null,
  p_unread_only boolean default false,
  p_limit int default 10
)
returns table (
  id uuid,
  org_id uuid,
  project_id uuid,
  title text,
  summary text,
  content_md text,
  content_hash text,
  source_workstream text,
  target_workstreams text[],
  domain text,
  code_areas text[],
  context_type text,
  priority text,
  status text,
  repo_paths text[],
  related_files text[],
  tags text[],
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  version int,
  confidence_score numeric,
  inference_notes text,
  author_note_md text,
  author_note_source text,
  author_note_updated_at timestamptz,
  author_note_updated_by uuid,
  match_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(
    trim(
      regexp_replace(
        coalesce(p_query, ''),
        '\m(latest|recent|current|context|about|related|find|get|show)\M',
        ' ',
        'gi'
      )
    ),
    ''
  );
  v_tsquery tsquery;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_actor_user_id
  ) then
    raise exception 'PROJECT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if v_query is not null then
    v_tsquery := websearch_to_tsquery('english', v_query);
    if numnode(v_tsquery) = 0 then
      v_tsquery := null;
    end if;
  end if;

  return query
  with candidates as (
    select
      c.*,
      case
        when v_tsquery is null then 0::real
        else ts_rank_cd(
          public.neptune_context_search_vector(
            c.title,
            c.author_note_md,
            c.summary,
            c.tags,
            c.domain,
            c.context_type,
            c.source_workstream,
            c.target_workstreams,
            c.code_areas,
            c.repo_paths,
            c.content_md
          ),
          v_tsquery
        )
      end as search_rank
    from public.contexts c
    where c.project_id = p_project_id
      and c.status = 'active'
      and p_target_workstream = any(c.target_workstreams)
      and (p_domain is null or c.domain = p_domain)
      and (p_context_type is null or c.context_type = p_context_type)
      and (p_code_area is null or p_code_area = any(c.code_areas))
      and (p_updated_after is null or c.updated_at >= p_updated_after)
      and (
        not p_unread_only
        or not exists (
          select 1
          from public.context_reads r
          where r.context_id = c.id
            and r.user_id = p_actor_user_id
        )
      )
      and (
        v_tsquery is null
        or public.neptune_context_search_vector(
          c.title,
          c.author_note_md,
          c.summary,
          c.tags,
          c.domain,
          c.context_type,
          c.source_workstream,
          c.target_workstreams,
          c.code_areas,
          c.repo_paths,
          c.content_md
        ) @@ v_tsquery
      )
  )
  select
    q.id,
    q.org_id,
    q.project_id,
    q.title,
    q.summary,
    q.content_md,
    q.content_hash,
    q.source_workstream,
    q.target_workstreams,
    q.domain,
    q.code_areas,
    q.context_type,
    q.priority,
    q.status,
    q.repo_paths,
    q.related_files,
    q.tags,
    q.created_by,
    q.created_at,
    q.updated_at,
    q.version,
    q.confidence_score,
    q.inference_notes,
    q.author_note_md,
    q.author_note_source,
    q.author_note_updated_at,
    q.author_note_updated_by,
    case
      when v_tsquery is null then 'Matched routing filters; ordered by latest update.'
      when q.title ilike '%' || v_query || '%' then 'Matched query in title.'
      when q.author_note_md ilike '%' || v_query || '%' then 'Matched query in author note.'
      when q.summary ilike '%' || v_query || '%' then 'Matched query in summary.'
      when array_to_string(q.tags, ' ') ilike '%' || v_query || '%' then 'Matched query in tags.'
      when q.domain ilike '%' || v_query || '%' then 'Matched query in domain.'
      when replace(q.context_type, '_', ' ') ilike '%' || v_query || '%' then 'Matched query in context type.'
      when array_to_string(q.target_workstreams, ' ') ilike '%' || v_query || '%' then 'Matched query in target workstreams.'
      when array_to_string(q.code_areas, ' ') ilike '%' || v_query || '%' then 'Matched query in code areas.'
      when array_to_string(q.repo_paths, ' ') ilike '%' || v_query || '%' then 'Matched query in repo paths.'
      else 'Matched query by full-text search.'
    end as match_reason
  from candidates q
  order by
    q.search_rank desc,
    case q.priority
      when 'blocking' then 4
      when 'high' then 3
      when 'normal' then 2
      when 'low' then 1
      else 0
    end desc,
    coalesce(q.confidence_score, 0) desc,
    q.updated_at desc
  limit v_limit;
end;
$$;

create or replace function public.neptune_retrieve_context(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_intent text default null,
  p_mode text default 'smart',
  p_target_workstream text default null,
  p_domain text default null,
  p_code_area text default null,
  p_context_type text default null,
  p_limit int default 10
)
returns table (
  id uuid,
  org_id uuid,
  project_id uuid,
  title text,
  summary text,
  content_md text,
  content_hash text,
  source_workstream text,
  target_workstreams text[],
  domain text,
  code_areas text[],
  context_type text,
  priority text,
  status text,
  repo_paths text[],
  related_files text[],
  tags text[],
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  version int,
  confidence_score numeric,
  inference_notes text,
  author_note_md text,
  author_note_source text,
  author_note_updated_at timestamptz,
  author_note_updated_by uuid,
  score real,
  match_kind text,
  match_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(
    trim(
      regexp_replace(
        coalesce(p_intent, ''),
        '\m(latest|recent|current|context|about|related|find|get|show|that|this|doc|document|uploaded|upload|today|yesterday)\M',
        ' ',
        'gi'
      )
    ),
    ''
  );
  v_strict_tsquery tsquery;
  v_rank_tsquery tsquery;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_is_strict boolean := coalesce(p_mode, 'smart') = 'strict';
begin
  if coalesce(p_mode, 'smart') not in ('smart', 'strict') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.projects p where p.id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_actor_user_id
  ) then
    raise exception 'PROJECT_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if v_query is not null then
    v_strict_tsquery := websearch_to_tsquery('english', v_query);
    if numnode(v_strict_tsquery) = 0 then
      v_strict_tsquery := null;
    end if;

    if v_is_strict then
      v_rank_tsquery := v_strict_tsquery;
    else
      select nullif(string_agg(term_query::text, ' | '), '')::tsquery
      into v_rank_tsquery
      from (
        select websearch_to_tsquery('english', token) as term_query
        from regexp_split_to_table(v_query, '[^[:alnum:]]+') as tokens(token)
        where char_length(token) > 1
      ) term_queries
      where numnode(term_query) > 0;

      v_rank_tsquery := coalesce(v_rank_tsquery, v_strict_tsquery);
    end if;
  end if;

  return query
  with candidates as (
    select
      c.*,
      case
        when v_rank_tsquery is null then 0::real
        else ts_rank_cd(
          public.neptune_context_search_vector(
            c.title,
            c.author_note_md,
            c.summary,
            c.tags,
            c.domain,
            c.context_type,
            c.source_workstream,
            c.target_workstreams,
            c.code_areas,
            c.repo_paths,
            c.content_md
          ),
          v_rank_tsquery
        )
      end as search_rank,
      (
        case when p_target_workstream is not null and p_target_workstream = any(c.target_workstreams) then 4 else 0 end +
        case when p_domain is not null and c.domain = p_domain then 3 else 0 end +
        case when p_context_type is not null and c.context_type = p_context_type then 2 else 0 end +
        case when p_code_area is not null and p_code_area = any(c.code_areas) then 2 else 0 end
      )::real as hint_score
    from public.contexts c
    where c.project_id = p_project_id
      and c.status = 'active'
      and (not v_is_strict or p_target_workstream is null or p_target_workstream = any(c.target_workstreams))
      and (not v_is_strict or p_domain is null or c.domain = p_domain)
      and (not v_is_strict or p_context_type is null or c.context_type = p_context_type)
      and (not v_is_strict or p_code_area is null or p_code_area = any(c.code_areas))
      and (
        not v_is_strict
        or v_strict_tsquery is null
        or public.neptune_context_search_vector(
          c.title,
          c.author_note_md,
          c.summary,
          c.tags,
          c.domain,
          c.context_type,
          c.source_workstream,
          c.target_workstreams,
          c.code_areas,
          c.repo_paths,
          c.content_md
        ) @@ v_strict_tsquery
      )
  ),
  scored as (
    select
      q.*,
      case q.priority
        when 'blocking' then 4
        when 'high' then 3
        when 'normal' then 2
        when 'low' then 1
        else 0
      end as priority_score
    from candidates q
  )
  select
    q.id,
    q.org_id,
    q.project_id,
    q.title,
    q.summary,
    q.content_md,
    q.content_hash,
    q.source_workstream,
    q.target_workstreams,
    q.domain,
    q.code_areas,
    q.context_type,
    q.priority,
    q.status,
    q.repo_paths,
    q.related_files,
    q.tags,
    q.created_by,
    q.created_at,
    q.updated_at,
    q.version,
    q.confidence_score,
    q.inference_notes,
    q.author_note_md,
    q.author_note_source,
    q.author_note_updated_at,
    q.author_note_updated_by,
    ((q.search_rank * 100) + q.hint_score + q.priority_score + coalesce(q.confidence_score, 0))::real as score,
    case
      when q.search_rank > 0 then 'full_text'
      when q.hint_score > 0 then 'hint'
      else 'recent'
    end as match_kind,
    case
      when v_is_strict and q.search_rank > 0 then 'Strict filters matched; ranked by intent full-text search.'
      when v_is_strict then 'Strict filters matched; ordered by latest update.'
      when q.search_rank > 0 then 'Matched one or more intent terms by project-wide full-text search.'
      when q.hint_score > 0 then 'No strong intent match; boosted by routing hints.'
      when nullif(trim(coalesce(p_intent, '')), '') is not null then 'No strong intent match; showing recent active project context.'
      else 'No intent supplied; showing recent active project context.'
    end as match_reason
  from scored q
  order by
    case when q.search_rank > 0 then 1 else 0 end desc,
    q.search_rank desc,
    q.hint_score desc,
    case when q.search_rank = 0 then q.updated_at else null end desc,
    q.priority_score desc,
    coalesce(q.confidence_score, 0) desc,
    q.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.neptune_upsert_context(uuid, jsonb) from anon, authenticated;
revoke all on function public.neptune_update_context_author_note(uuid, uuid, text, text) from anon, authenticated;
revoke all on function public.neptune_list_relevant_context(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  int
) from PUBLIC, anon, authenticated;
revoke all on function public.neptune_retrieve_context(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  int
) from PUBLIC, anon, authenticated;

grant execute on function public.neptune_upsert_context(uuid, jsonb) to service_role;
grant execute on function public.neptune_update_context_author_note(uuid, uuid, text, text) to service_role;
grant execute on function public.neptune_list_relevant_context(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  boolean,
  int
) to service_role;
grant execute on function public.neptune_retrieve_context(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  int
) to service_role;
