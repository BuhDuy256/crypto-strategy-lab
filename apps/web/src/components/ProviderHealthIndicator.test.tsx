// @vitest-environment jsdom
// The SPA side of MKT-09 criterion 8: degraded is shown during an outage and
// cleared after recovery.
//
// The indicator is deliberately dumb, so these tests check exactly that: it
// renders what Market Data reported and nothing it worked out for itself.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderHealthResponse } from "@crypto-strategy-lab/api-contracts";
import { ProviderHealthIndicator } from "./ProviderHealthIndicator.js";

const { getProviderHealth } = vi.hoisted(() => ({ getProviderHealth: vi.fn() }));
vi.mock("../api/client.js", () => ({ getProviderHealth }));

function health(overrides: Partial<ProviderHealthResponse> = {}): ProviderHealthResponse {
  return { provider: "binance", status: "healthy", checkedAt: 1_700_000_000_000, ...overrides };
}

/** Advances the poll timer and lets the pending fetch settle. */
async function nextPoll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ProviderHealthIndicator", () => {
  it("shows the provider as live while health is healthy", async () => {
    getProviderHealth.mockResolvedValue(health());

    render(<ProviderHealthIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByRole("status");
    expect(indicator.getAttribute("data-provider-health")).toBe("healthy");
    expect(indicator.textContent).toContain("Market data: live");
  });

  it("shows degraded with the reason during an outage and clears it after recovery", async () => {
    getProviderHealth.mockResolvedValue(health());
    render(<ProviderHealthIndicator />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("status").getAttribute("data-provider-health")).toBe("healthy");

    // The outage: ingest recorded degraded, and the shell picks it up on its
    // next poll without anything else on the page changing.
    getProviderHealth.mockResolvedValue(
      health({ status: "degraded", reason: "the provider closed the stream" })
    );
    await nextPoll();

    const degraded = screen.getByRole("status");
    expect(degraded.getAttribute("data-provider-health")).toBe("degraded");
    expect(degraded.textContent).toContain("Market data: degraded - the provider closed the stream");

    // Recovery is still degraded, with its own reason, because the existing
    // status model has no separate value for it.
    getProviderHealth.mockResolvedValue(
      health({ status: "degraded", reason: "recovering the closed candles the outage missed" })
    );
    await nextPoll();
    expect(screen.getByRole("status").textContent).toContain("recovering the closed candles");

    // Recovery finished and live flow resumed.
    getProviderHealth.mockResolvedValue(health());
    await nextPoll();

    const recovered = screen.getByRole("status");
    expect(recovered.getAttribute("data-provider-health")).toBe("healthy");
    expect(recovered.textContent).toContain("Market data: live");
  });

  it("reports an unreachable API separately from a degraded provider", async () => {
    getProviderHealth.mockRejectedValue(new Error("network down"));

    render(<ProviderHealthIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    const indicator = screen.getByRole("status");
    expect(indicator.getAttribute("data-provider-health")).toBe("unreachable");
    expect(indicator.textContent).toContain("status unavailable");
  });

  it("shows unavailable when ingest has never reported", async () => {
    getProviderHealth.mockResolvedValue(
      health({ status: "unavailable", checkedAt: 0, reason: "market ingest has not reported provider health yet" })
    );

    render(<ProviderHealthIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("status").getAttribute("data-provider-health")).toBe("unavailable");
  });

  it("stops polling once it is unmounted", async () => {
    getProviderHealth.mockResolvedValue(health());
    const view = render(<ProviderHealthIndicator />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getProviderHealth).toHaveBeenCalledTimes(1);

    view.unmount();
    await nextPoll();

    expect(getProviderHealth).toHaveBeenCalledTimes(1);
  });
});
