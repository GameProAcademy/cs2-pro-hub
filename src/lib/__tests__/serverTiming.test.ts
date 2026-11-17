/** PM3 observability: Server-Timing header format and fail-safety. */
import { describe, expect, it, vi } from "vitest";

const set = vi.fn();
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: (...a: unknown[]) => set(...a),
}));
const { stageTimer } = await import("@/lib/serverTiming");

describe("stageTimer", () => {
  it("reports each stage since the previous mark plus the handler total", () => {
    let t = 1000;
    const timer = stageTimer(() => t);
    t = 1500;
    timer.mark("overview");
    t = 1520.04;
    timer.mark("segment_reads");
    expect(timer.header()).toBe("overview;dur=500.0, segment_reads;dur=20.0, handler;dur=520.0");
    timer.emit();
    expect(set).toHaveBeenCalledWith("Server-Timing", timer.header());
  });

  it("ignores unsafe stage names and never throws when the header cannot be set", () => {
    const timer = stageTimer(() => 0);
    timer.mark("user;id=1");
    expect(timer.header()).toBe("handler;dur=0.0");
    set.mockImplementationOnce(() => {
      throw new Error("no event");
    });
    expect(() => timer.emit()).not.toThrow();
  });
});
