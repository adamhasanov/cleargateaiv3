// Grants or removes the admin role:   npm run user:role -- someone@example.com admin|user
//
// Uses DATABASE_URL (hosted Postgres) if set, otherwise the local development
// database in ./.data/db — stop `npm run dev` first, the local database allows one process.
import { readFileSync } from "node:fs";

const [email, role] = process.argv.slice(2);
if (!email || !["admin", "user"].includes(role)) {
  console.error("usage: npm run user:role -- <email> <admin|user>");
  process.exit(1);
}

// Read DATABASE_URL from .env.local when not in the environment.
let url = process.env.DATABASE_URL;
if (!url) {
  try {
    url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
  } catch {}
}

const sql = "UPDATE users SET role = $1, updated_at = now() WHERE lower(email) = lower($2) RETURNING email, role";
let rows;
if (url && /^postgres(ql)?:\/\//.test(url)) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  ({ rows } = await client.query(sql, [role, email]));
  await client.end();
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(process.env.PGLITE_DATA_DIR || ".data/db");
  ({ rows } = await db.query(sql, [role, email]));
  await db.close();
}
console.log(rows.length ? `${rows[0].email} → ${rows[0].role}` : `No user with e-mail ${email}`);
process.exit(rows.length ? 0 : 2);
