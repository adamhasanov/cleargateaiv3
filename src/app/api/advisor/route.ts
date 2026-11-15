import { z } from "zod";
import { advisorSystemPrompt, type CheckSnapshot } from "@/lib/ai/advisor-prompt";
import { advisorConfigured, chatReply } from "@/lib/ai/chat";
import { runCheck } from "@/lib/engine/compare";
import { computeRiskScore } from "@/lib/engine/risk";
import { DOCUMENT_IDS, type DocumentExtraction } from "@/lib/engine/types";
import { assertSameOrigin, clientIp, fail, handler, json, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI Customs Advisor — stateless (MVP demo: no accounts, no database).
 * The browser keeps the conversation and sends it with every question; nothing
 * is stored here. If a check is attached, the browser sends only its extracted
 * VALUES; the comparison and the risk score are recomputed on the server, so
 * the model is never told a result the rule engine did not produce.
 */

const value = z.object({
  raw: z.string().max(200),
  number: z.number().finite().optional(),
  unit: z.string().max(40).optional(),
  code: z.string().max(40).optional(),
  basis: z.enum(["gross", "net", "unspecified"]).optional(),
});
const outcome = z.discriminatedUnion("status", [
  z.object({ status: z.literal("value"), value }),
  z.object({ status: z.literal("notFound") }),
  z.object({ status: z.literal("notApplicable") }),
]);
const extraction = z.object({
  document: z.enum(DOCUMENT_IDS),
  readable: z.boolean(),
  fields: z.object({ weight: outcome, quantity: outcome, price: outcome, hsCode: outcome }),
});

const schema = z.object({
  locale: z.enum(["az", "ru", "en"]),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20),
  check: z
    .object({
      createdAt: z.string().max(40),
      documentNames: z.record(z.string().max(30), z.string().max(255)).refine((r) => Object.keys(r).length <= 3),
      extractions: z.array(extraction).length(3),
    })
    .nullable()
    .default(null),
});

export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  if (!rateLimit(`advisor|${clientIp(request)}`, 30, 10 * 60_000)) return fail("tooManyRequests", 429);
  if (!advisorConfigured()) return fail("advisor_notConfigured", 503);
  const { locale, messages, check } = await readJson(request, schema, 65_536);
  if (messages[messages.length - 1].role !== "user") return fail("badRequest", 400);

  let snapshot: CheckSnapshot | null = null;
  if (check) {
    const result = runCheck(check.extractions as DocumentExtraction[]);
    snapshot = { createdAt: check.createdAt, documentNames: check.documentNames, result, risk: computeRiskScore(result) };
  }

  const turns = [...messages];
  while (turns.length && turns[0].role !== "user") turns.shift(); // providers expect the history to start with the user
  const reply = await chatReply(advisorSystemPrompt(locale, snapshot), turns);
  if (!reply.ok) {
    return fail(`advisor_${reply.error}`, reply.error === "notConfigured" ? 503 : reply.error === "quotaExceeded" ? 429 : 502);
  }
  return json({ reply: reply.text.slice(0, 12_000) });
});
