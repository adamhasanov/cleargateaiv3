import "server-only";
import { MIGRATIONS } from "./migrations";
import { syncPlans } from "@/lib/billing/plans-sync";

/**
 * Database access.
 *
 * - DATABASE_URL set (postgres://…): a hosted PostgreSQL via `pg` (production).
 * - DATABASE_URL unset: an embedded PostgreSQL (PGlite) stored in ./.data/db
 *   for local development. DATABASE_URL=memory:// gives a throwaway database (tests).
 *
 * Both expose the same tiny interface with $1-style parameters, so the rest of
 * the code never depends on which one is running.
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  /** Runs fn inside one transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

async function createPglite(dataDir: string | undefined): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const wrap = (q: { query: typeof pg.query }): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      const res = await q.query<T>(text, params as unknown[]);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
  });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
  };
}

/** The URL may carry ?sslmode=require; TLS is configured explicitly below, so drop it (avoids pg's deprecation warning). */
function withoutSslMode(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = (await import("pg")).default;
  const pool = new Pool({
    connectionString: withoutSslMode(url),
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: /sslmode=disable/.test(url) || /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  const run = async <T>(client: { query: typeof pool.query }, text: string, params: unknown[] = []) => {
    const res = await client.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  };
  return {
    query: (text, params) => run(pool, text, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (text, params) => run(client, text, params) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      // Statements are separated by ";\n" at line ends; migrations contain no functions or strings with that pattern.
      for (const statement of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
        await tx.query(statement);
      }
      await tx.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [m.id]);
    });
  }
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  if (process.env.VERCEL && !(url && /^postgres(ql)?:\/\//.test(url))) {
    // Serverless file systems are read-only/ephemeral: the embedded database cannot keep data there.
    throw new Error("DATABASE_URL (PostgreSQL) must be set in production");
  }
  const db =
    url && /^postgres(ql)?:\/\//.test(url)
      ? await createPostgres(url)
      : await createPglite(url === "memory://" ? undefined : process.env.PGLITE_DATA_DIR?.trim() || ".data/db");
  await migrate(db);
  await syncPlans(db);
  return db;
}

// One connection per server process; survives hot reloads in development.
const globalForDb = globalThis as unknown as { __cgDb?: Promise<Db>; __cgMigrations?: number };

export function getDb(): Promise<Db> {
  if (!globalForDb.__cgDb) {
    globalForDb.__cgMigrations = MIGRATIONS.length;
    globalForDb.__cgDb = open().catch((error) => {
      globalForDb.__cgDb = undefined;
      throw error;
    });
  } else if (globalForDb.__cgMigrations !== MIGRATIONS.length) {
    // A migration was added while the dev server kept its connection (hot reload): apply it now.
    globalForDb.__cgMigrations = MIGRATIONS.length;
    globalForDb.__cgDb = globalForDb.__cgDb.then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return globalForDb.__cgDb;
}

/** Test helper: forget the current connection so the next getDb() opens a fresh one. */
export function resetDbForTests(): void {
  globalForDb.__cgDb = undefined;
}
