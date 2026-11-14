import { useEffect } from "react";
import { simulationStore } from "./simulationStore";

/** Drives the simulation from requestAnimationFrame, independent of WebGL. */
export function useSimulationClock(store = simulationStore) {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      store.getState().tick((now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [store]);
}
