import "server-only";
import { getAccountState } from "@/lib/billing/account";
import { getPlan } from "@/lib/billing/plans";
import { runCheck } from "@/lib/engine/compare";
import { computeRiskScore, type RiskScore } from "@/lib/engine/risk";
import { DOCUMENT_IDS, type CheckResult, type DocumentExtraction, type DocumentId } from "@/lib/engine/types";
import type { Db, Queryable } from "./db";
import { HttpError } from "./http";

/** A check left "processing" this long (e.g. tab closed) is marked failed, which returns its usage. */
const STALE_MINUTES = 20;
const MAX_CONCURRENT = 3;

export type DocumentNames = Record<DocumentId, string>;

export interface CheckRecord {
  id: string;
  status: "processing" | "completed" | "failed";
  funding: "plan" | "credit";
  createdAt: string;
  completedAt: string | null;
  documentNames: Partial<DocumentNames>;
  result: CheckResult | null;
  /** Omitted when the user's plan does not include the risk score. */
  risk: RiskScore | null;
}

interface CheckRow {
  id: string; status: CheckRecord["status"]; funding: CheckRecord["funding"]; created_at: Date; completed_at: Date | null;
  document_names: Partial<DocumentNames>; result: CheckResult | null; risk_score: number | null; risk_level: RiskScore["level"] | null;
  risk_reasons: RiskScore["reasons"] | null; risk_version: string | null; extractions: Partial<Record<DocumentId, DocumentExtraction>>;
}

function toRecord(row: CheckRow, riskAccess: boolean): CheckRecord {
  return {
    id: row.id,
    status: row.status,
    funding: row.funding,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    documentNames: row.document_names ?? {},
    result: row.result,
    risk:
      riskAccess && row.risk_score !== null && row.risk_level && row.risk_reasons && row.risk_version
        ? { score: row.risk_score, level: row.risk_level, reasons: row.risk_reasons, version: row.risk_version }
        : null,
  };
}

async function failStale(db: Queryable, userId: string) {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE checks SET status = 'failed', completed_at = now()
      WHERE user_id = $1 AND status = 'processing' AND created_at < now() - make_interval(mins => $2)
      RETURNING id`,
    [userId, STALE_MINUTES],
  );
  for (const r of rows) await refundCredit(db, r.id);
}

async function refundCredit(db: Queryable, checkId: string) {
  await db.query(`UPDATE check_credits SET used_by_check_id = NULL, used_at = NULL WHERE used_by_check_id = $1`, [checkId]);
}

/**
 * Reserves one document check for the user: from the plan's allowance first,
 * then from a paid single-check credit. Runs under a per-user row lock so
 * parallel requests cannot spend the same allowance twice.
 */
export async function startCheck(db: Db, userId: string, documentNames: DocumentNames): Promise<{ id: string; funding: "plan" | "credit" }> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    await failStale(tx, userId);
    const { rows: busy } = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM checks WHERE user_id = $1 AND status = 'processing'`, [userId],
    );
    if (Number(busy[0].n) >= MAX_CONCURRENT) throw new HttpError(429, "tooManyChecks");

    const state = await getAccountState(tx, userId);
    if (state.usage.remaining === null || state.usage.remaining > 0) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO checks (user_id, status, funding, document_names) VALUES ($1, 'processing', 'plan', $2::jsonb) RETURNING id`,
        [userId, JSON.stringify(documentNames)],
      );
      return { id: rows[0].id, funding: "plan" as const };
    }

    const { rows: credit } = await tx.query<{ id: string }>(
      `SELECT id FROM check_credits WHERE user_id = $1 AND used_by_check_id IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE`,
      [userId],
    );
    if (!credit[0]) {
      throw new HttpError(402, "limitReached", { usage: state.usage, plan: state.plan.code });
    }
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO checks (user_id, status, funding, document_names) VALUES ($1, 'processing', 'credit', $2::jsonb) RETURNING id`,
      [userId, JSON.stringify(documentNames)],
    );
    await tx.query(`UPDATE check_credits SET used_by_check_id = $1, used_at = now() WHERE id = $2`, [rows[0].id, credit[0].id]);
    return { id: rows[0].id, funding: "credit" as const };
  });
}

/** Throws unless the check exists, belongs to the user and is still processing; says whether this document was already read. */
export async function assertCheckAcceptsDocument(db: Queryable, userId: string, checkId: string, document: DocumentId): Promise<void> {
  const { rows } = await db.query<{ status: string; has_doc: boolean }>(
    `SELECT status, (extractions ? $3) AS has_doc FROM checks WHERE id = $1 AND user_id = $2`,
    [checkId, userId, document],
  );
  if (!rows[0]) throw new HttpError(404, "checkNotFound");
  if (rows[0].status !== "processing") throw new HttpError(409, "checkClosed");
  if (rows[0].has_doc) throw new HttpError(409, "documentAlreadyRead");
}

/** Stores the values read from one document (never the file itself). */
export async function recordExtraction(db: Queryable, userId: string, checkId: string, extraction: DocumentExtraction): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE checks SET extractions = extractions || jsonb_build_object($3::text, $4::jsonb)
      WHERE id = $1 AND user_id = $2 AND status = 'processing'`,
    [checkId, userId, extraction.document, JSON.stringify(extraction)],
  );
  if (rowCount === 0) throw new HttpError(409, "checkClosed");
}

/** Runs the rule engine and the risk score on the server-held extractions and stores the result. */
export async function finalizeCheck(db: Db, userId: string, checkId: string): Promise<CheckRecord> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<CheckRow>(`SELECT * FROM checks WHERE id = $1 AND user_id = $2 FOR UPDATE`, [checkId, userId]);
    const row = rows[0];
    if (!row) throw new HttpError(404, "checkNotFound");
    const state = await getAccountState(tx, userId);
    if (row.status === "completed") return toRecord(row, state.plan.riskScoreAccess);
    if (row.status !== "processing") throw new HttpError(409, "checkClosed");
    const extractions = DOCUMENT_IDS.map((d) => row.extractions?.[d]);
    if (extractions.some((e) => !e)) throw new HttpError(409, "documentsMissing");

    const result = runCheck(extractions as DocumentExtraction[]);
    const risk = computeRiskScore(result);
    const { rows: done } = await tx.query<CheckRow>(
      `UPDATE checks SET status = 'completed', completed_at = now(), result = $3::jsonb, result_class = $4, rule_set_version = $5,
              risk_score = $6, risk_level = $7, risk_reasons = $8::jsonb, risk_version = $9
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [checkId, userId, JSON.stringify(result), result.resultClass, result.ruleSetVersion,
       risk.score, risk.level, JSON.stringify(risk.reasons), risk.version],
    );
    return toRecord(done[0], state.plan.riskScoreAccess);
  });
}

/** Marks a processing check failed; its plan usage or paid credit is given back. */
export async function failCheck(db: Db, userId: string, checkId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE checks SET status = 'failed', completed_at = now() WHERE id = $1 AND user_id = $2 AND status = 'processing' RETURNING id`,
      [checkId, userId],
    );
    if (rows[0]) await refundCredit(tx, checkId);
  });
}

/** The user's checks within the plan's history window, newest first. */
export async function listChecks(db: Queryable, userId: string, limit = 50): Promise<CheckRecord[]> {
  const state = await getAccountState(db, userId);
  const days = state.plan.historyDays;
  const { rows } = await db.query<CheckRow>(
    `SELECT * FROM checks WHERE user_id = $1 AND ($2::int IS NULL OR created_at >= now() - make_interval(days => $2::int))
      ORDER BY created_at DESC LIMIT $3`,
    [userId, days, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => toRecord(r, state.plan.riskScoreAccess));
}

/** One check, only if it belongs to the user and is inside their history window. */
export async function getCheck(db: Queryable, userId: string, checkId: string): Promise<CheckRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(checkId)) return null;
  const state = await getAccountState(db, userId);
  const { rows } = await db.query<CheckRow>(
    `SELECT * FROM checks WHERE id = $1 AND user_id = $2 AND ($3::int IS NULL OR created_at >= now() - make_interval(days => $3::int))`,
    [checkId, userId, state.plan.historyDays],
  );
  return rows[0] ? toRecord(rows[0], getPlan(state.plan.code)!.riskScoreAccess) : null;
}

export async function checkTotals(db: Queryable, userId: string): Promise<{ total: number; completed: number }> {
  const { rows } = await db.query<{ total: string; completed: string }>(
    `SELECT count(*)::text AS total, count(*) FILTER (WHERE status = 'completed')::text AS completed FROM checks WHERE user_id = $1`,
    [userId],
  );
  return { total: Number(rows[0].total), completed: Number(rows[0].completed) };
}
