import { DEFAULT_CREW_CONFIG } from "../../src/domain/equipment";
import { buildSourcePoints, DEMO_GEOMETRY } from "../../src/domain/survey";
import { allocateLines, buildExecutionPlan, formatDuration, PlanningError, snakeOrder } from "../../src/planner/executionPlan";

describe("execution planner", () => {
  const points = buildSourcePoints(DEMO_GEOMETRY);

  it("allocates contiguous line blocks evenly", () => {
    expect(allocateLines([1004, 1001, 1002, 1003, 1005], 2)).toEqual([[1001, 1002, 1003], [1004, 1005]]);
    expect(allocateLines([1, 2], 3)).toEqual([[1], [2], []]);
    expect(() => allocateLines([1], 0)).toThrow(PlanningError);
  });

  it("orders VPs boustrophedon to minimise move-up", () => {
    const order = snakeOrder(points, [1001, 1002]).map((p) => p.id);
    expect(order[11]).toBe("S1001-P2012");
    expect(order[12]).toBe("S1002-P2012"); // turns at the end of the line, no dead-head back
  });

  it("schedules every VP exactly once with monotonic times", () => {
    const plan = buildExecutionPlan(points, DEFAULT_CREW_CONFIG);
    const ids = plan.fleets.flatMap((f) => f.tasks.map((t) => t.sourcePointId));
    expect(ids.sort()).toEqual(points.map((p) => p.id).sort());
    for (const f of plan.fleets) {
      f.tasks.forEach((t, i) => {
        expect(t.completeAtS).toBeGreaterThan(t.arriveAtS);
        if (i > 0) expect(t.arriveAtS).toBeGreaterThanOrEqual(f.tasks[i - 1]!.completeAtS);
      });
    }
    expect(plan.makespanS).toBe(Math.max(...plan.fleets.map((f) => f.durationS)));
    expect(plan.vpPerHour).toBeGreaterThan(0);
  });

  it("more fleets never increase the makespan", () => {
    const one = buildExecutionPlan(points, { ...DEFAULT_CREW_CONFIG, vibratorFleets: 1 });
    const four = buildExecutionPlan(points, { ...DEFAULT_CREW_CONFIG, vibratorFleets: 4 });
    expect(four.makespanS).toBeLessThan(one.makespanS);
  });

  it("rejects empty or duplicate surveys", () => {
    expect(() => buildExecutionPlan([], DEFAULT_CREW_CONFIG)).toThrow(/no source points/);
    expect(() => buildExecutionPlan([points[0]!, points[0]!], DEFAULT_CREW_CONFIG)).toThrow(/Duplicate/);
  });

  it("formats durations", () => {
    expect(formatDuration(65)).toBe("1m 05s");
    expect(formatDuration(3720)).toBe("1h 02m");
    expect(formatDuration(-5)).toBe("0m 00s");
  });
});
