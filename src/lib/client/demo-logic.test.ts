import { describe, expect, it } from "vitest";
import { getPlan } from "@/lib/billing/plans";
import { fundingFor, usageFor, visibleChecks } from "./demo-logic";

const free = getPlan("free")!;
const premium = getPlan("professional")!;
const now = new Date(2026, 5, 15, 12);
const at = (y: number, m: number, d: number) => ({ createdAt: new Date(y, m, d, 10).toISOString() });

describe("demo plan limits (simulated, browser only)", () => {
  it("free plan: one check in total, regardless of month", () => {
    expect(usageFor(free, [], now)).toEqual({ used: 0, limit: 1, remaining: 1 });
    expect(usageFor(free, [at(2026, 0, 3)], now)).toEqual({ used: 1, limit: 1, remaining: 0 });
  });

  it("paid plan: only checks of the current calendar month count", () => {
    const u = usageFor(premium, [at(2026, 5, 2), at(2026, 4, 30)], now);
    expect(u.used).toBe(1);
    expect(u.remaining).toBe(premium.monthlyCheckLimit! - 1);
  });

  it("funding: plan first, then a credit, otherwise none", () => {
    expect(fundingFor({ used: 0, limit: 1, remaining: 1 }, 0)).toBe("plan");
    expect(fundingFor({ used: 1, limit: 1, remaining: 0 }, 2)).toBe("credit");
    expect(fundingFor({ used: 1, limit: 1, remaining: 0 }, 0)).toBeNull();
    expect(fundingFor({ used: 99, limit: null, remaining: null }, 0)).toBe("plan");
  });

  it("history window: newest first, older than the plan's days hidden", () => {
    const starter = getPlan("starter")!;
    const old = { createdAt: new Date(now.getTime() - (starter.historyDays! + 5) * 86_400_000).toISOString() };
    const recent1 = at(2026, 5, 1);
    const recent2 = at(2026, 5, 10);
    expect(visibleChecks(starter, [old, recent1, recent2], now)).toEqual([recent2, recent1]);
    expect(visibleChecks(premium, [old, recent1], now)).toHaveLength(2); // unlimited history
  });
});
