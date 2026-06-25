create index if not exists idx_contexts_active_relevant
on public.contexts(project_id, context_type, domain, updated_at desc)
where status = 'active';

create index if not exists idx_contexts_tags
on public.contexts using gin(tags);

create index if not exists idx_contexts_repo_paths
on public.contexts using gin(repo_paths);

create or replace function public.neptune_context_search_vector(
  p_title text,
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
    case
      when v_tsquery is null then 'Matched routing filters; ordered by latest update.'
      when q.title ilike '%' || v_query || '%' then 'Matched query in title.'
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
