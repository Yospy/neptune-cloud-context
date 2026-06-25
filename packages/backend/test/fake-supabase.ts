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
  "show"
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

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private containsFilters: Array<[string, unknown[]]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private selected = false;
  private action: "select" | "insert" | "update" | "upsert" = "select";
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
      if (fn === "neptune_list_relevant_context") {
        return relevantContextRows(tables, args);
      }
      throw new Error("RPC is not implemented by createFakeSupabase.");
    }
  };
}
