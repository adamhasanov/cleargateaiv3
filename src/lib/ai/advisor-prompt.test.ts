import { describe, expect, it } from "vitest";
import { runCheck } from "@/lib/engine/compare";
import { computeRiskScore } from "@/lib/engine/risk";
import { SAMPLE_EXTRACTIONS } from "@/lib/sample";
import { advisorSystemPrompt, summarizeCheck, type CheckSnapshot } from "./advisor-prompt";

const result = runCheck(SAMPLE_EXTRACTIONS);
const snapshot: CheckSnapshot = { createdAt: "2026-06-01T10:00:00.000Z", documentNames: { invoice: "inv.pdf" }, result, risk: computeRiskScore(result) };

describe("advisor prompt (stateless snapshot)", () => {
  it("summarises values and the risk score from the snapshot", () => {
    const s = summarizeCheck(snapshot);
    expect(s.checkedAt).toBe(snapshot.createdAt);
    expect(s.fields.length).toBe(result.comparisons.length);
    expect(s.riskScore).toMatchObject({ score: snapshot.risk!.score });
  });

  it("states the risk score is not in the plan when absent", () => {
    expect(summarizeCheck({ ...snapshot, risk: null }).riskScore).toMatch(/not included/);
  });

  it("without a check, tells the model none is attached", () => {
    expect(advisorSystemPrompt("en", null)).toMatch(/No document check is attached/);
    expect(advisorSystemPrompt("en", snapshot)).toMatch(/inv\.pdf/);
  });
});
