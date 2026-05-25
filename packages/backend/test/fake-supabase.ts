type Row = Record<string, any>;

export type FakeTables = Record<string, Row[]>;

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
    async rpc() {
      throw new Error("RPC is not implemented by createFakeSupabase.");
    }
  };
}
