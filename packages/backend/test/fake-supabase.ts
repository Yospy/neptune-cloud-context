type Row = Record<string, any>;

export type FakeTables = Record<string, Row[]>;

const retrievalStopWords = new Set([
  "latest",
  "recent",
  "current",
  "context",
  "about",
  "related",
  "find",
  "get",
  "show",
  "that",
  "this",
  "doc",
  "document",
  "uploaded",
  "upload",
  "today",
  "yesterday"
]);

let idCounter = 1;

function nextId() {
  return `00000000-0000-4000-8000-${String(idCounter++).padStart(12, "0")}`;
}

function now() {
  return new Date("2026-05-16T12:00:00.000Z").toISOString();
}

function matches(row: Row, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function matchesContains(row: Row, filters: Array<[string, unknown[]]>) {
  return filters.every(([key, values]) => {
    const rowValue = row[key];
    return Array.isArray(rowValue) && values.every((value) => rowValue.includes(value));
  });
}

function matchesIn(row: Row, filters: Array<[string, unknown[]]>) {
  return filters.every(([key, values]) => values.includes(row[key]));
}

function normalizeText(value: unknown) {
  if (Array.isArray(value)) return value.join(" ").toLowerCase();
  return String(value ?? "").toLowerCase();
}

function queryTerms(value: unknown) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !retrievalStopWords.has(term));
}

function queryScore(row: Row, query: unknown) {
  const terms = queryTerms(query);
  if (!terms.length) return 0;

  const weighted = [
    [row.title, 8],
    [row.author_note_md, 8],
    [row.summary, 5],
    [row.tags, 5],
    [row.domain, 5],
    [String(row.context_type ?? "").replace(/_/g, " "), 3],
    [row.source_workstream, 3],
    [row.target_workstreams, 3],
    [row.code_areas, 3],
    [row.repo_paths, 3],
    [row.content_md, 1]
  ] as const;

  return terms.reduce(
    (score, term) =>
      score +
      weighted.reduce(
        (fieldScore, [value, weight]) =>
          fieldScore + (normalizeText(value).includes(term) ? weight : 0),
        0
      ),
    0
  );
}

function searchableText(row: Row) {
  return [
    row.title,
    row.author_note_md,
    row.summary,
    row.tags,
    row.domain,
    String(row.context_type ?? "").replace(/_/g, " "),
    row.source_workstream,
    row.target_workstreams,
    row.code_areas,
    row.repo_paths,
    row.content_md
  ]
    .map(normalizeText)
    .join(" ");
}

function priorityScore(priority: unknown) {
  if (priority === "blocking") return 4;
  if (priority === "high") return 3;
  if (priority === "normal") return 2;
  if (priority === "low") return 1;
  return 0;
}

function relevantContextRows(tables: FakeTables, args: Record<string, unknown>) {
  const projectId = args.p_project_id;
  const actorUserId = args.p_actor_user_id;
  const project = (tables.projects ?? []).find((row) => row.id === projectId);

  if (!project) {
    return { data: null, error: { message: "PROJECT_NOT_FOUND" } };
  }

  const isMember = (tables.project_members ?? []).some(
    (row) => row.project_id === projectId && row.user_id === actorUserId
  );

  if (!isMember) {
    return { data: null, error: { message: "PROJECT_ACCESS_DENIED" } };
  }

  const query = args.p_query;
  const terms = queryTerms(query);
  const hasQuery = terms.length > 0;
  const limit = Math.max(1, Math.min(Number(args.p_limit ?? 10), 50));

  const rows = (tables.contexts ?? [])
    .filter((row) => row.project_id === projectId)
    .filter((row) => row.status === "active")
    .filter((row) => Array.isArray(row.target_workstreams) && row.target_workstreams.includes(args.p_target_workstream))
    .filter((row) => !args.p_domain || row.domain === args.p_domain)
    .filter((row) => !args.p_context_type || row.context_type === args.p_context_type)
    .filter((row) => !args.p_code_area || row.code_areas?.includes(args.p_code_area))
    .filter((row) => !args.p_updated_after || row.updated_at >= args.p_updated_after)
    .filter(
      (row) =>
        !args.p_unread_only ||
        !(tables.context_reads ?? []).some(
          (read) => read.context_id === row.id && read.user_id === actorUserId
        )
    )
    .map((row) => ({ ...row, __score: hasQuery ? queryScore(row, query) : 0 }))
    .filter((row) => !hasQuery || terms.every((term) => searchableText(row).includes(term)))
    .sort((a, b) => {
      if (b.__score !== a.__score) return b.__score - a.__score;
      const priorityDelta = priorityScore(b.priority) - priorityScore(a.priority);
      if (priorityDelta !== 0) return priorityDelta;
      const confidenceDelta = Number(b.confidence_score ?? 0) - Number(a.confidence_score ?? 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    })
    .slice(0, limit)
    .map(({ __score, ...row }) => ({
      ...row,
      match_reason: hasQuery ? "Matched query by full-text search." : "Matched routing filters; ordered by latest update."
    }));

  return { data: rows, error: null };
}

function hintScore(row: Row, args: Record<string, unknown>) {
  let score = 0;
  if (args.p_target_workstream && row.target_workstreams?.includes(args.p_target_workstream)) score += 4;
  if (args.p_domain && row.domain === args.p_domain) score += 3;
  if (args.p_context_type && row.context_type === args.p_context_type) score += 2;
  if (args.p_code_area && row.code_areas?.includes(args.p_code_area)) score += 2;
  return score;
}

function retrieveContextRows(tables: FakeTables, args: Record<string, unknown>) {
  const projectId = args.p_project_id;
  const actorUserId = args.p_actor_user_id;
  const project = (tables.projects ?? []).find((row) => row.id === projectId);

  if (!project) {
    return { data: null, error: { message: "PROJECT_NOT_FOUND" } };
  }

  const isMember = (tables.project_members ?? []).some(
    (row) => row.project_id === projectId && row.user_id === actorUserId
  );

  if (!isMember) {
    return { data: null, error: { message: "PROJECT_ACCESS_DENIED" } };
  }

  const mode = args.p_mode ?? "smart";
  if (mode !== "smart" && mode !== "strict") {
    return { data: null, error: { message: "VALIDATION_FAILED" } };
  }

  const query = args.p_intent;
  const terms = queryTerms(query);
  const hasQuery = terms.length > 0;
  const strict = mode === "strict";
  const limit = Math.max(1, Math.min(Number(args.p_limit ?? 10), 50));

  const rows = (tables.contexts ?? [])
    .filter((row) => row.project_id === projectId)
    .filter((row) => row.status === "active")
    .filter((row) => !strict || !args.p_target_workstream || row.target_workstreams?.includes(args.p_target_workstream))
    .filter((row) => !strict || !args.p_domain || row.domain === args.p_domain)
    .filter((row) => !strict || !args.p_context_type || row.context_type === args.p_context_type)
    .filter((row) => !strict || !args.p_code_area || row.code_areas?.includes(args.p_code_area))
    .map((row) => ({
      ...row,
      __queryScore: hasQuery ? queryScore(row, query) : 0,
      __hintScore: hintScore(row, args)
    }))
    .filter((row) => !strict || !hasQuery || terms.every((term) => searchableText(row).includes(term)))
    .sort((a, b) => {
      const matchDelta = Number(b.__queryScore > 0) - Number(a.__queryScore > 0);
      if (matchDelta !== 0) return matchDelta;
      if (b.__queryScore !== a.__queryScore) return b.__queryScore - a.__queryScore;
      if (b.__hintScore !== a.__hintScore) return b.__hintScore - a.__hintScore;
      if (a.__queryScore === 0 && b.__queryScore === 0) {
        const recencyDelta = String(b.updated_at).localeCompare(String(a.updated_at));
        if (recencyDelta !== 0) return recencyDelta;
      }
      const priorityDelta = priorityScore(b.priority) - priorityScore(a.priority);
      if (priorityDelta !== 0) return priorityDelta;
      const confidenceDelta = Number(b.confidence_score ?? 0) - Number(a.confidence_score ?? 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    })
    .slice(0, limit)
    .map(({ __queryScore, __hintScore, ...row }) => ({
      ...row,
      score: __queryScore + __hintScore + priorityScore(row.priority) + Number(row.confidence_score ?? 0),
      match_kind: __queryScore > 0 ? "full_text" : __hintScore > 0 ? "hint" : "recent",
      match_reason:
        mode === "strict" && __queryScore > 0
          ? "Strict filters matched; ranked by intent full-text search."
          : mode === "strict"
            ? "Strict filters matched; ordered by latest update."
            : __queryScore > 0
              ? "Matched one or more intent terms by project-wide full-text search."
              : __hintScore > 0
                ? "No strong intent match; boosted by routing hints."
                : query
                  ? "No strong intent match; showing recent active project context."
                  : "No intent supplied; showing recent active project context."
    }));

  return { data: rows, error: null };
}

function upsertContext(tables: FakeTables, args: Record<string, unknown>) {
  const payload = (args.p_payload ?? {}) as Row;
  const projectId = payload.project_id;
  const actorUserId = args.p_actor_user_id;
  const project = (tables.projects ?? []).find((row) => row.id === projectId);

  if (!project) {
    return { data: null, error: { message: "PROJECT_NOT_FOUND" } };
  }

  const isMember = (tables.project_members ?? []).some(
    (row) => row.project_id === projectId && row.user_id === actorUserId
  );

  if (!isMember) {
    return { data: null, error: { message: "PROJECT_ACCESS_DENIED" } };
  }

  const authorNoteMd =
    typeof payload.author_note_md === "string" && payload.author_note_md.trim()
      ? payload.author_note_md.trim()
      : null;
  const authorNoteSource =
    typeof payload.author_note_source === "string" && payload.author_note_source.trim()
      ? payload.author_note_source.trim()
      : null;
  const authorNoteRequested = authorNoteMd !== null;

  if (authorNoteRequested && !["manual", "agent_inferred"].includes(String(authorNoteSource))) {
    return { data: null, error: { message: "VALIDATION_FAILED" } };
  }

  if (!authorNoteRequested && authorNoteSource !== null) {
    return { data: null, error: { message: "VALIDATION_FAILED" } };
  }

  const org = (tables.orgs ?? []).find((row) => row.id === project.org_id);
  const existing = (tables.contexts ?? []).find(
    (row) => row.project_id === projectId && row.title === payload.title
  );

  if (existing && authorNoteRequested && existing.created_by !== actorUserId) {
    return { data: null, error: { message: "AUTHOR_NOTE_ACCESS_DENIED" } };
  }

  const applyPayload = (row: Row, version: number) => {
    Object.assign(row, {
      summary: payload.summary,
      content_md: payload.content_md,
      content_hash: payload.content_hash,
      source_workstream: payload.source_workstream,
      target_workstreams: payload.target_workstreams ?? [],
      domain: payload.domain,
      code_areas: payload.code_areas ?? [],
      context_type: payload.context_type,
      priority: payload.priority ?? "normal",
      status: "active",
      repo_paths: payload.repo_paths ?? [],
      related_files: payload.related_files ?? [],
      tags: payload.tags ?? [],
      confidence_score: payload.confidence_score,
      inference_notes: payload.inference_notes,
      version,
      updated_at: now()
    });

    if (authorNoteRequested) {
      Object.assign(row, {
        author_note_md: authorNoteMd,
        author_note_source: authorNoteSource,
        author_note_updated_at: now(),
        author_note_updated_by: actorUserId
      });
    }
  };

  const context =
    existing ??
    {
      id: nextId(),
      org_id: project.org_id,
      project_id: projectId,
      title: payload.title,
      created_by: actorUserId,
      created_at: now()
    };

  const contentChanged = !existing || existing.content_hash !== payload.content_hash;
  const authorNoteChanged =
    authorNoteRequested &&
    (existing?.author_note_md !== authorNoteMd || existing?.author_note_source !== authorNoteSource);
  const nextVersion = existing ? Number(existing.version ?? 1) + (contentChanged ? 1 : 0) : 1;

  applyPayload(context, nextVersion);

  if (!existing) {
    (tables.contexts ?? []).push(context);
  }

  if (contentChanged) {
    (tables.context_versions ?? []).push({
      id: nextId(),
      context_id: context.id,
      org_id: context.org_id,
      project_id: context.project_id,
      version: context.version,
      content_md: context.content_md,
      content_hash: context.content_hash,
      metadata: { ...payload, content_md: undefined },
      created_by: actorUserId,
      created_at: now()
    });
  }

  if (contentChanged || authorNoteChanged) {
    (tables.context_events ?? []).push({
      id: nextId(),
      org_id: context.org_id,
      project_id: context.project_id,
      context_id: context.id,
      actor_user_id: actorUserId,
      event_type: contentChanged ? (existing ? "context.updated" : "context.created") : "context.author_note.updated",
      payload: { content_hash: context.content_hash, version: context.version },
      created_at: now()
    });
  }

  return {
    data: {
      ok: true,
      changed: contentChanged || authorNoteChanged,
      receipt: {
        context_id: context.id,
        org: org?.slug,
        project: project.slug,
        title: context.title,
        source_workstream: context.source_workstream,
        target_workstreams: context.target_workstreams,
        domain: context.domain,
        code_areas: context.code_areas,
        context_type: context.context_type,
        status: context.status,
        version: context.version,
        created_at: context.created_at,
        content_hash: context.content_hash,
        author_note_md: context.author_note_md ?? null,
        author_note_source: context.author_note_source ?? null,
        author_note_updated_at: context.author_note_updated_at ?? null,
        author_note_updated_by: context.author_note_updated_by ?? null
      }
    },
    error: null
  };
}

function updateContextAuthorNote(tables: FakeTables, args: Record<string, unknown>) {
  const context = (tables.contexts ?? []).find((row) => row.id === args.p_context_id);

  if (!context) {
    return { data: null, error: { message: "CONTEXT_NOT_FOUND" } };
  }

  const isMember = (tables.project_members ?? []).some(
    (row) => row.project_id === context.project_id && row.user_id === args.p_actor_user_id
  );

  if (!isMember) {
    return { data: null, error: { message: "PROJECT_ACCESS_DENIED" } };
  }

  if (context.created_by !== args.p_actor_user_id) {
    return { data: null, error: { message: "AUTHOR_NOTE_ACCESS_DENIED" } };
  }

  if (!args.p_author_note_md || !["manual", "agent_inferred"].includes(String(args.p_author_note_source))) {
    return { data: null, error: { message: "VALIDATION_FAILED" } };
  }

  Object.assign(context, {
    author_note_md: args.p_author_note_md,
    author_note_source: args.p_author_note_source,
    author_note_updated_at: now(),
    author_note_updated_by: args.p_actor_user_id,
    updated_at: now()
  });

  (tables.context_events ?? []).push({
    id: nextId(),
    org_id: context.org_id,
    project_id: context.project_id,
    context_id: context.id,
    actor_user_id: args.p_actor_user_id,
    event_type: "context.author_note.updated",
    payload: { author_note_source: args.p_author_note_source },
    created_at: now()
  });

  return { data: { ok: true }, error: null };
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private containsFilters: Array<[string, unknown[]]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private selected = false;
  private action: "select" | "delete" | "insert" | "update" | "upsert" = "select";
  private values: Row | Row[] | null = null;
  private orderBy: { key: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;

  constructor(
    private readonly tables: FakeTables,
    private readonly tableName: string
  ) {}

  select() {
    this.selected = true;
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push([key, value]);
    return this;
  }

  contains(key: string, values: unknown[]) {
    this.containsFilters.push([key, values]);
    return this;
  }

  in(key: string, values: unknown[]) {
    this.inFilters.push([key, values]);
    return this;
  }

  order(key: string, options: { ascending: boolean }) {
    this.orderBy = { key, ascending: options.ascending };
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  insert(values: Row | Row[]) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  update(values: Row) {
    this.action = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  upsert(values: Row, options: { onConflict: string }) {
    this.action = "upsert";
    this.values = {
      ...values,
      __onConflict: options.onConflict
    };
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      data: rows[0] ?? null,
      error: null
    };
  }

  async single() {
    const result = await this.execute();
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      data: rows[0] ?? null,
      error: null
    };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    const rows = this.tables[this.tableName] ?? [];

    if (this.action === "insert") {
      const inserted = (Array.isArray(this.values) ? this.values : [this.values]).map((value) => ({
        id: nextId(),
        created_at: now(),
        updated_at: now(),
        ...value
      }));
      rows.push(...inserted);
      this.tables[this.tableName] = rows;
      return { data: this.selected ? inserted : null, error: null };
    }

    if (this.action === "update") {
      const updated = this.filteredRows(rows).map((row) => {
        Object.assign(row, this.values, { updated_at: now() });
        return row;
      });
      return { data: this.selected ? updated : null, error: null };
    }

    if (this.action === "upsert") {
      const values = { ...(this.values ?? {}) };
      const onConflict = String(values.__onConflict ?? "").split(",");
      delete values.__onConflict;
      const existing = rows.find((row) => onConflict.every((key) => row[key] === values[key]));
      if (existing) {
        Object.assign(existing, values);
      } else {
        rows.push({ id: nextId(), created_at: now(), updated_at: now(), ...values });
      }
      this.tables[this.tableName] = rows;
      return { data: this.selected ? [existing ?? values] : null, error: null };
    }

    if (this.action === "delete") {
      const deleted = this.filteredRows(rows);
      this.tables[this.tableName] = rows.filter((row) => !deleted.includes(row));
      return { data: this.selected ? deleted : null, error: null };
    }

    return { data: this.filteredRows(rows), error: null };
  }

  private filteredRows(rows: Row[]) {
    let result = rows
      .filter((row) => matches(row, this.filters))
      .filter((row) => matchesContains(row, this.containsFilters))
      .filter((row) => matchesIn(row, this.inFilters));

    if (this.orderBy) {
      const { key, ascending } = this.orderBy;
      result = [...result].sort((a, b) => {
        if (a[key] === b[key]) return 0;
        return (a[key] > b[key] ? 1 : -1) * (ascending ? 1 : -1);
      });
    }

    if (this.rowLimit !== null) {
      result = result.slice(0, this.rowLimit);
    }

    return result;
  }
}

export function createFakeSupabase(tables: FakeTables) {
  return {
    from(tableName: string) {
      return new FakeQuery(tables, tableName);
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      if (fn === "neptune_upsert_context") {
        return upsertContext(tables, args);
      }
      if (fn === "neptune_list_relevant_context") {
        return relevantContextRows(tables, args);
      }
      if (fn === "neptune_retrieve_context") {
        return retrieveContextRows(tables, args);
      }
      if (fn === "neptune_update_context_author_note") {
        return updateContextAuthorNote(tables, args);
      }
      throw new Error("RPC is not implemented by createFakeSupabase.");
    }
  };
}
