/**
 * Tiny, dependency-free mock of the supabase-js client surface used by POS /
 * finance Server-Action query helpers, so money-sensitive queries can have
 * BEHAVIORAL tests (execute + assert the returned shape) instead of only static
 * source scans. Covers: `.from(t).select().eq().not().maybeSingle()/.single()`,
 * `.rpc(name, args)`, and `.auth.getUser()`.
 *
 * Stub responses per table / rpc; every query and rpc is recorded for
 * assertions. Not a Postgres emulator — the per-table resolver receives the
 * recorded filters and returns whatever {data,error} the test wants.
 */

export type MockResult = { data: unknown; error: unknown };

export type RecordedQuery = {
  table: string;
  columns: string | null;
  eq: Array<[string, unknown]>;
  not: Array<[string, string, unknown]>;
  terminal: "maybeSingle" | "single" | null;
};

export type RecordedRpc = { name: string; args: Record<string, unknown> };

export interface SupabaseMockOptions {
  /** Per-table resolver. Receives the recorded query (filters) → {data,error}. */
  tables?: Record<string, (query: RecordedQuery) => MockResult>;
  /** Per-rpc resolver. */
  rpcs?: Record<string, (args: Record<string, unknown>) => MockResult>;
  /** auth.getUser() user; default a fixed test uid. `null` = signed out. */
  user?: { id: string } | null;
}

export interface SupabaseMock {
  /** Cast to the action's expected client type at the call site. */
  client: unknown;
  calls: { queries: RecordedQuery[]; rpcs: RecordedRpc[] };
}

const DEFAULT_USER = { id: "00000000-0000-0000-0000-000000000001" };

export function createSupabaseMock(opts: SupabaseMockOptions = {}): SupabaseMock {
  const calls: SupabaseMock["calls"] = { queries: [], rpcs: [] };
  const user = opts.user === undefined ? DEFAULT_USER : opts.user;

  function from(table: string) {
    const q: RecordedQuery = {
      table,
      columns: null,
      eq: [],
      not: [],
      terminal: null,
    };
    const settle = (terminal: NonNullable<RecordedQuery["terminal"]>) => {
      q.terminal = terminal;
      calls.queries.push(q);
      const resolver = opts.tables?.[table];
      return Promise.resolve<MockResult>(
        resolver ? resolver(q) : { data: null, error: null },
      );
    };
    const builder = {
      select(columns?: string) {
        q.columns = columns ?? null;
        return builder;
      },
      eq(column: string, value: unknown) {
        q.eq.push([column, value]);
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        q.not.push([column, operator, value]);
        return builder;
      },
      maybeSingle() {
        return settle("maybeSingle");
      },
      single() {
        return settle("single");
      },
    };
    return builder;
  }

  function rpc(name: string, args: Record<string, unknown> = {}) {
    calls.rpcs.push({ name, args });
    const resolver = opts.rpcs?.[name];
    return Promise.resolve<MockResult>(
      resolver ? resolver(args) : { data: null, error: null },
    );
  }

  const auth = {
    getUser() {
      return Promise.resolve({ data: { user }, error: null });
    },
  };

  return { client: { from, rpc, auth }, calls };
}
