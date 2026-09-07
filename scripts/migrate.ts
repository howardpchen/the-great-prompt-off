import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { getPool } from "../app/lib/db/pool";
async function main() {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(784215)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query("DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='prompt_off_app') THEN REVOKE ALL ON schema_migrations FROM prompt_off_app; END IF; END $$");
    const applied = await client.query<{ name: string; checksum: string }>(
      "SELECT name,checksum FROM schema_migrations",
    );
    for (const name of (await readdir("db/migrations"))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = await readFile(`db/migrations/${name}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prior = applied.rows.find((row) => row.name === name);
      if (prior) {
        if (prior.checksum !== checksum)
          throw new Error(`Migration checksum mismatch: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(784215)");
    client.release();
    await getPool().end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed; transaction rolled back. Inspect database migration state.",
  );
  process.exitCode = 1;
});
