import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./rate-limit";

afterEach(() => vi.useRealTimers());

describe("rateLimit", () => {
  it("allows up to max requests per window, then blocks, then resets", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) expect(rateLimit("k1", 3, 1000)).toBe(true);
    expect(rateLimit("k1", 3, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit("k1", 3, 1000)).toBe(true);
  });

  it("counts keys independently", () => {
    expect(rateLimit("a", 1, 1000)).toBe(true);
    expect(rateLimit("b", 1, 1000)).toBe(true);
    expect(rateLimit("a", 1, 1000)).toBe(false);
  });
});
