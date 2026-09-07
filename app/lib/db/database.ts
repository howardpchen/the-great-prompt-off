import "server-only";
import type { PoolClient } from "pg";
import { getPool } from "./pool";
type Filter = readonly [
  string,
  "eq" | "neq" | "in" | "is" | "gt" | "gte" | "lt" | "lte",
  unknown,
];
type Query = {
  table: string;
  operation?: "select" | "insert" | "upsert" | "update" | "delete";
  columns?: string;
  values?: object | object[];
  conflict?: string;
  where?: Filter[];
  any?: Filter[];
  order?: [string, { ascending?: boolean }][];
  limit?: number;
  count?: boolean;
  single?: "single" | "maybeSingle";
};
export type DatabaseError = { message: string; code?: string };
export type Result<T> = {
  data: T;
  error: DatabaseError | null;
  count: number | null;
};
const identifier = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Invalid SQL identifier");
  return `"${value}"`;
};
const columns = (value = "*") =>
  value === "*"
    ? "*"
    : value
        .split(",")
        .map((v) => identifier(v.trim()))
        .join(", ");
const jsonColumns = new Set([
  "output_schema",
  "schema_snapshot",
  "answer_values",
  "scored_values",
  "parsed_output",
  "invalid_fields",
  "profile_snapshot",
  "summary",
  "config",
  "metadata",
  "field_metrics",
  "diagnostics",
  "per_field",
  "metrics",
  "prompt_metadata",
]);
export class Database {
  constructor(private readonly client?: PoolClient) {}
  async sql<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
    return (this.client || getPool())
      .query(text, values)
      .then((r) => r.rows as T[]);
  }
  async transaction<T>(work: (database: Database) => Promise<T>): Promise<T> {
    if (this.client) return work(this);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await work(new Database(client));
      const commit = await client.query("COMMIT");
      if (commit.command !== "COMMIT") throw new Error("Database transaction was rolled back");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async execute<T = Record<string, unknown>[]>(
    spec: Query,
  ): Promise<Result<T>> {
    try {
      const values: unknown[] = [];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const condition = ([column, op, value]: Filter) => {
        const col = identifier(column);
        if (op === "in") return `${col} = ANY(${bind(value)})`;
        if (op === "is") {
          if (value !== null) throw new Error("Only IS NULL is supported");
          return `${col} IS NULL`;
        }
        return `${col} ${{ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} ${bind(value)}`;
      };
      const table = `public.${identifier(spec.table)}`;
      const operation = spec.operation || "select";
      let sql = "";
      if (operation === "select")
        sql = `SELECT ${spec.count ? "count(*)::integer AS count" : columns(spec.columns)} FROM ${table}`;
      if (operation === "delete") sql = `DELETE FROM ${table}`;
      if (operation === "update") {
        const row = spec.values as Record<string, unknown>;
        sql = `UPDATE ${table} SET ${Object.entries(row)
          .filter(([, v]) => v !== undefined)
          .map(
            ([k, v]) =>
              `${identifier(k)} = ${bind(jsonColumns.has(k) && !(spec.table === "simulation_run_items" && k === "invalid_fields") ? (v === null ? null : JSON.stringify(v)) : v)}`,
          )
          .join(", ")}`;
      }
      if (operation === "insert" || operation === "upsert") {
        const rows = (
          Array.isArray(spec.values) ? spec.values : [spec.values]
        ) as Record<string, unknown>[];
        if (!rows.length) return { data: [] as T, error: null, count: 0 };
        const keys = [
          ...new Set(
            rows.flatMap((row) =>
              Object.keys(row).filter((k) => row[k] !== undefined),
            ),
          ),
        ];
        sql = `INSERT INTO ${table} (${keys.map(identifier).join(", ")}) VALUES ${rows.map((row) => "(" + keys.map((k) => (row[k] === undefined ? "DEFAULT" : bind(jsonColumns.has(k) && !(spec.table === "simulation_run_items" && k === "invalid_fields") ? (row[k] === null ? null : JSON.stringify(row[k])) : row[k]))).join(", ") + ")").join(", ")}`;
        if (operation === "upsert") {
          const conflicts = (spec.conflict || "id")
            .split(",")
            .map((k) => k.trim());
          const updates = keys.filter((k) => !conflicts.includes(k));
          sql += ` ON CONFLICT (${conflicts.map(identifier).join(", ")}) DO ${updates.length ? "UPDATE SET " + updates.map((k) => `${identifier(k)} = EXCLUDED.${identifier(k)}`).join(", ") : "NOTHING"}`;
        }
      }
      const predicates = (spec.where || []).map(condition);
      if (spec.any?.length)
        predicates.push("(" + spec.any.map(condition).join(" OR ") + ")");
      if (predicates.length) sql += " WHERE " + predicates.join(" AND ");
      if (
        (operation === "delete" || operation === "update") &&
        !predicates.length
      )
        throw new Error("Unbounded mutations require an explicit SQL function");
      if (spec.order?.length)
        sql +=
          " ORDER BY " +
          spec.order
            .map(
              ([col, opt]) =>
                `${identifier(col)} ${opt.ascending === false ? "DESC" : "ASC"}`,
            )
            .join(", ");
      if (spec.limit !== undefined) sql += " LIMIT " + bind(spec.limit);
      if (operation !== "select" && spec.columns)
        sql += " RETURNING " + columns(spec.columns);
      const rows = await this.sql(sql, values);
      if (
        spec.single &&
        (rows.length > 1 || (spec.single === "single" && rows.length !== 1))
      )
        return {
          data: null as T,
          error: { code: "PGRST116", message: "Expected one database row" },
          count: null,
        };
      return {
        data: (spec.single ? rows[0] || null : rows) as T,
        error: null,
        count: spec.count ? Number(rows[0]?.count || 0) : rows.length,
      };
    } catch (error) {
      const e = error as { code?: string };
      return {
        data: null as T,
        error: { code: e.code, message: "Database operation failed" },
        count: null,
      };
    }
  }
  async rpc(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Result<unknown>> {
    // Application-owned SQL functions only, never arbitrary server procedure calls.
    const allowed = [
      "admin_reset_workshop_run_data",
      "admin_clear_participant_run_data",
      "admin_update_challenge_schema",
      "admin_delete_simulation_batch",
      "admin_clear_simulation_data",
      "admin_set_simulation_reference",
      "admin_clear_simulation_reference",
    ];
    if (!allowed.includes(name)) throw new Error("Unknown database operation");
    try {
      const rows = await this.sql(
        `SELECT public.${identifier(name)}(${Object.keys(args)
          .map((key, i) => `${identifier(key)} => $${i + 1}`)
          .join(", ")}) AS result`,
        Object.values(args),
      );
      return { data: rows[0]?.result, error: null, count: null };
    } catch (error) {
      return {
        data: null,
        error: {
          code: (error as { code?: string }).code,
          message: "Database operation failed",
        },
        count: null,
      };
    }
  }
}
export function createDatabase() {
  return new Database();
}
