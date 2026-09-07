import "server-only";
import { readFileSync } from "node:fs";
import { Pool, types } from "pg";
// Preserve JSON API shapes formerly returned by PostgREST.
types.setTypeParser(1700, Number);
types.setTypeParser(20, Number);
types.setTypeParser(1184, (value) => new Date(value).toISOString());
let pool: Pool | undefined;
export function getPool() {
  if (!pool) {
    if (
      !process.env.DATABASE_URL &&
      (!process.env.PGHOST || !process.env.PGDATABASE || !process.env.PGUSER)
    ) {
      throw new Error(
        "Configure server-only PGHOST, PGDATABASE and PGUSER (or DATABASE_URL).",
      );
    }
    const max = Number(process.env.PGPOOL_MAX || 10);
    if (!Number.isInteger(max) || max < 1 || max > 50)
      throw new Error("Invalid PGPOOL_MAX");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      password: process.env.PGPASSWORD_FILE
        ? readFileSync(process.env.PGPASSWORD_FILE, "utf8").trim()
        : undefined,
      max,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      application_name: "great-prompt-off",
    });
    pool.on("error", () => console.error("[database] Idle connection failure"));
  }
  return pool;
}
