import { createSimulationStore } from "../../src/store/simulationStore";

describe("simulation store", () => {
  it("only advances while running", () => {
    const store = createSimulationStore(1);
    store.getState().tick(0.1);
    expect(store.getState().sim.t).toBe(0);
    store.getState().setRunning(true);
    store.getState().tick(0.1);
    expect(store.getState().sim.t).toBeCloseTo(0.1 * 30);
  });

  it("clamps large frame gaps and speed", () => {
    const store = createSimulationStore(1);
    store.getState().setSpeed(10_000);
    expect(store.getState().speed).toBe(600);
    store.getState().setRunning(true);
    store.getState().tick(30); // tab was backgrounded
    expect(store.getState().sim.t).toBeCloseTo(0.25 * 600);
  });

  it("reset restores t=0 and can change the scenario seed", () => {
    const store = createSimulationStore(1);
    store.getState().setRunning(true);
    store.getState().tick(0.2);
    store.getState().reset(99);
    expect(store.getState()).toMatchObject({ running: false, seed: 99, sim: { t: 0 } });
  });

  it("rejects an invalid crew configuration without losing state", () => {
    const store = createSimulationStore(1);
    const before = store.getState().plan;
    store.getState().configure({ vibratorFleets: 0 });
    expect(store.getState().error).toMatch(/vibratorFleets/);
    expect(store.getState().plan).toBe(before);
    store.getState().configure({ vibratorFleets: 2 });
    expect(store.getState().error).toBeNull();
    expect(store.getState().plan.fleets).toHaveLength(2);
  });
});
