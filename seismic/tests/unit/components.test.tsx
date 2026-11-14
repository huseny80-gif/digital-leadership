import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StatTile } from "../../src/components/StatTile";
import { PhaseBadge } from "../../src/components/StatusBadge";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { SyncStatus } from "../../src/components/SyncStatus";
import { SyncQueue } from "../../src/offline/syncQueue";
import { App } from "../../src/App";
import { simulationStore } from "../../src/store/simulationStore";

describe("UI components", () => {
  it("StatTile exposes an accessible, clamped progress meter", () => {
    render(<StatTile title="Production" value="3/10" progress={1.7} />);
    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Production progress" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("PhaseBadge maps phases to human labels", () => {
    render(<PhaseBadge phase="waitingFix" />);
    expect(screen.getByText("Waiting DGPS fix")).toHaveClass("badge-warn");
  });

  it("ErrorBoundary contains a crashing panel", () => {
    const Boom = () => { throw new Error("no webgl"); };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary fallback={(e) => <p>fallback: {e.message}</p>}><Boom /></ErrorBoundary>);
    expect(screen.getByText("fallback: no webgl")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("SyncStatus disables sync when offline and surfaces errors", async () => {
    const queue = new SyncQueue({ dbName: "ui-sync-1" });
    await queue.enqueue("production", {}, "one");
    const onFlush = vi.fn(async () => { throw new Error("1 will retry"); });
    const { rerender } = render(<SyncStatus queue={queue} online={false} onReport={async () => {}} onFlush={onFlush} />);
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    rerender(<SyncStatus queue={queue} online onReport={async () => {}} onFlush={onFlush} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("1 will retry");
  });
});

describe("App", () => {
  beforeEach(() => simulationStore.getState().reset(7));

  it("renders the dashboard and starts/pauses the simulation", async () => {
    render(<App webgl={false} queue={new SyncQueue({ dbName: "ui-app-1" })} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("7th Seismic Crew");
    expect(screen.getByText(/WebGL is not available/)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 3); // header + 3 fleets
    const start = screen.getByRole("button", { name: "Start acquisition" });
    fireEvent.click(start);
    expect(simulationStore.getState().running).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(simulationStore.getState().running).toBe(false);
  });

  it("queues a production report offline-first", async () => {
    const queue = new SyncQueue({ dbName: "ui-app-2" });
    render(<App webgl={false} queue={queue} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Log production report" })); });
    await waitFor(async () => expect(await queue.size()).toBe(1));
    expect((await queue.list())[0]!.kind).toBe("production");
  });
});
