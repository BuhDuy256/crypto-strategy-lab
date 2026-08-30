// Unit tests for the search host's process-lifecycle wiring, with a fake
// coordinator. These prove the glue that makes a control request survive an API
// restart: on start the host relaunches a driving loop for every run still in a
// non-settled durable state, and resume/cancel relaunch a loop while pause does
// not need to. The coordinator's own durable convergence is tested against real
// PostgreSQL in search-coordinator.test.ts.

import { describe, expect, it, vi } from "vitest";
import { SearchExperimentHost } from "./search-experiment-host.js";
import type { SearchCoordinator } from "./search-coordinator.js";
import type { SearchProgress } from "./search-coordinator.js";

const progress: SearchProgress = {
  status: "running",
  stopReason: null,
  generated: 0,
  submitted: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  inFlight: 0
};

// A coordinator whose runToCompletion stays pending until its loop is aborted, so
// the host's launch bookkeeping (one loop per experiment) is observable.
function fakeCoordinator(active: string[] = []) {
  return {
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    progress: vi.fn(async () => progress),
    listActive: vi.fn(async () => active),
    runToCompletion: vi.fn(
      (_specId: string, signal?: AbortSignal) =>
        new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve(), { once: true });
        })
    )
  };
}

function hostWith(fake: ReturnType<typeof fakeCoordinator>): SearchExperimentHost {
  return new SearchExperimentHost(fake as unknown as SearchCoordinator);
}

describe("SearchExperimentHost", () => {
  it("relaunches a driving loop for every active run on resume-all", async () => {
    const fake = fakeCoordinator(["spec-a", "spec-b"]);
    const host = hostWith(fake);

    await host.resumeAll();

    expect(fake.listActive).toHaveBeenCalledOnce();
    expect(fake.runToCompletion.mock.calls.map((call) => call[0])).toEqual(["spec-a", "spec-b"]);
    host.stopAll();
  });

  it("resumes by requesting the transition then relaunching the loop", async () => {
    const fake = fakeCoordinator();
    const host = hostWith(fake);

    const result = await host.resume("spec-a");

    expect(fake.resume).toHaveBeenCalledWith("spec-a");
    expect(fake.runToCompletion.mock.calls.map((call) => call[0])).toEqual(["spec-a"]);
    expect(result).toEqual(progress);
    host.stopAll();
  });

  it("cancels by requesting the transition then relaunching the loop", async () => {
    const fake = fakeCoordinator();
    const host = hostWith(fake);

    await host.cancel("spec-a");

    expect(fake.cancel).toHaveBeenCalledWith("spec-a");
    expect(fake.runToCompletion.mock.calls.map((call) => call[0])).toEqual(["spec-a"]);
    host.stopAll();
  });

  it("pauses without starting a second loop", async () => {
    const fake = fakeCoordinator();
    const host = hostWith(fake);

    await host.pause("spec-a");

    expect(fake.pause).toHaveBeenCalledWith("spec-a");
    expect(fake.runToCompletion).not.toHaveBeenCalled();
  });

  it("drives only one loop per experiment even when relaunched", async () => {
    const fake = fakeCoordinator();
    const host = hostWith(fake);

    await host.resume("spec-a");
    await host.resume("spec-a");

    expect(fake.resume).toHaveBeenCalledTimes(2);
    // The first loop is still running, so the second resume does not start another.
    expect(fake.runToCompletion).toHaveBeenCalledTimes(1);
    host.stopAll();
  });
});
