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
  v_tsquery tsquery;
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
        or v_tsquery is null
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
    ((q.search_rank * 100) + q.hint_score + q.priority_score + coalesce(q.confidence_score, 0))::real as score,
    case
      when q.search_rank > 0 then 'full_text'
      when q.hint_score > 0 then 'hint'
      else 'recent'
    end as match_kind,
    case
      when v_is_strict and q.search_rank > 0 then 'Strict filters matched; ranked by intent full-text search.'
      when v_is_strict then 'Strict filters matched; ordered by latest update.'
      when q.search_rank > 0 then 'Matched intent by project-wide full-text search.'
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
