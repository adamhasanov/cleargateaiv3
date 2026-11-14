import "server-only";
import { advisorSystemPrompt } from "@/lib/ai/advisor-prompt";
import { chatReply, type ChatTurn } from "@/lib/ai/chat";
import { getAccountState } from "@/lib/billing/account";
import { getCheck } from "./checks";
import type { Db, Queryable } from "./db";
import { HttpError } from "./http";

const HISTORY_TURNS = 20;
const DAILY_MESSAGE_CAP = 100;

export interface Conversation {
  id: string;
  title: string;
  checkId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

type ConvRow = { id: string; title: string; check_id: string | null; created_at: Date; updated_at: Date };
type MsgRow = { id: string; role: Message["role"]; content: string; created_at: Date };

const toConv = (r: ConvRow): Conversation => ({
  id: r.id, title: r.title, checkId: r.check_id, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});
const toMsg = (r: MsgRow): Message => ({ id: r.id, role: r.role, content: r.content, createdAt: new Date(r.created_at).toISOString() });
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function assertAdvisorAccess(db: Queryable, userId: string): Promise<void> {
  const state = await getAccountState(db, userId);
  if (!state.plan.advisorAccess) throw new HttpError(403, "advisorNotInPlan", { plan: state.plan.code });
}

export async function listConversations(db: Queryable, userId: string): Promise<Conversation[]> {
  const { rows } = await db.query<ConvRow>(
    `SELECT id, title, check_id, created_at, updated_at FROM chat_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map(toConv);
}

export async function createConversation(db: Queryable, userId: string, checkId: string | null): Promise<Conversation> {
  if (checkId && !(await getCheck(db, userId, checkId))) throw new HttpError(404, "checkNotFound");
  const { rows } = await db.query<ConvRow>(
    `INSERT INTO chat_conversations (user_id, check_id) VALUES ($1, $2) RETURNING id, title, check_id, created_at, updated_at`,
    [userId, checkId],
  );
  return toConv(rows[0]);
}

/** A conversation and its messages — only for its owner (404 otherwise, same as non-existent). */
export async function getConversation(db: Queryable, userId: string, id: string): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  if (!isUuid(id)) return null;
  const { rows } = await db.query<ConvRow>(
    `SELECT id, title, check_id, created_at, updated_at FROM chat_conversations WHERE id = $1 AND user_id = $2`, [id, userId],
  );
  if (!rows[0]) return null;
  const { rows: msgs } = await db.query<MsgRow>(
    `SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at, id`, [id],
  );
  return { conversation: toConv(rows[0]), messages: msgs.map(toMsg) };
}

export async function deleteConversation(db: Queryable, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { rowCount } = await db.query(`DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rowCount > 0;
}

/**
 * Stores the user's message, asks the model with the conversation so far and
 * (if linked) the user's own check result, stores and returns the reply.
 * If the model fails, the user's message is removed again so a retry does not duplicate it.
 */
export async function sendMessage(
  db: Db, userId: string, conversationId: string, content: string, locale: "az" | "ru" | "en",
): Promise<{ user: Message; assistant: Message }> {
  await assertAdvisorAccess(db, userId);
  const conv = await getConversation(db, userId, conversationId);
  if (!conv) throw new HttpError(404, "conversationNotFound");

  const { rows: today } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1 AND m.role = 'user' AND m.created_at > now() - interval '1 day'`,
    [userId],
  );
  if (Number(today[0].n) >= DAILY_MESSAGE_CAP) throw new HttpError(429, "advisorDailyLimit");

  const check = conv.conversation.checkId ? await getCheck(db, userId, conv.conversation.checkId) : null;
  const { rows: inserted } = await db.query<MsgRow>(
    `INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'user', $2) RETURNING id, role, content, created_at`,
    [conversationId, content],
  );
  const userMsg = toMsg(inserted[0]);

  const turns: ChatTurn[] = [...conv.messages, userMsg].slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: m.content }));
  while (turns.length && turns[0].role !== "user") turns.shift(); // providers expect the history to start with the user

  const reply = await chatReply(advisorSystemPrompt(locale, check), turns);
  if (!reply.ok) {
    await db.query(`DELETE FROM chat_messages WHERE id = $1`, [userMsg.id]);
    throw new HttpError(reply.error === "notConfigured" ? 503 : reply.error === "quotaExceeded" ? 429 : 502, `advisor_${reply.error}`);
  }

  const { rows: answer } = await db.query<MsgRow>(
    `INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2) RETURNING id, role, content, created_at`,
    [conversationId, reply.text.slice(0, 12000)],
  );
  await db.query(
    `UPDATE chat_conversations SET updated_at = now(), title = CASE WHEN title = '' THEN $2 ELSE title END WHERE id = $1`,
    [conversationId, content.replace(/\s+/g, " ").trim().slice(0, 80)],
  );
  return { user: userMsg, assistant: toMsg(answer[0]) };
}
