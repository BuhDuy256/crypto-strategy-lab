// @vitest-environment jsdom
// Focused UI-02 behavior test: the browser builds and saves a composite, while
// the backend alone evaluates its real market-data window.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiStrategyDescriptor } from "@crypto-strategy-lab/api-contracts";
import { createComposite, evaluateComposite, getStrategies } from "../api/client.js";
import { StrategyEnginePage } from "./StrategyEnginePage.js";

vi.mock("../api/client.js", () => ({
  createComposite: vi.fn(),
  evaluateComposite: vi.fn(),
  getStrategies: vi.fn()
}));

const STRATEGIES: readonly ApiStrategyDescriptor[] = [
  {
    id: "catalog-one",
    version: "1.2.0",
    name: "Catalog one",
    description: "First test strategy.",
    category: "trend",
    capabilities: ["long", "short"],
    parameterSchema: { properties: {}, required: [] },
    requiredInputs: ["price-bars"]
  },
  {
    id: "catalog-two",
    version: "2.0.0",
    name: "Catalog two",
    description: "Second test strategy.",
    category: "momentum",
    capabilities: ["long", "short"],
    parameterSchema: { properties: {}, required: [] },
    requiredInputs: ["price-bars"]
  }
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StrategyEnginePage", () => {
  it("saves catalog strategies and evaluates the saved composite over the chosen window", async () => {
    vi.mocked(getStrategies).mockResolvedValue({ strategies: STRATEGIES });
    vi.mocked(createComposite).mockResolvedValue({ id: "composite-real", version: "1.0.0" });
    vi.mocked(evaluateComposite).mockResolvedValue({ action: "buy", effectiveTime: 123 });

    render(<StrategyEnginePage />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "+ ADD STRATEGY" })).toHaveLength(2));
    for (const button of screen.getAllByRole("button", { name: "+ ADD STRATEGY" })) {
      fireEvent.click(button);
    }
    expect(screen.queryByText("Simulated Output")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("e.g. Alpha Trend 2.0"), {
      target: { value: "Real composite" }
    });
    fireEvent.change(screen.getByLabelText("Evaluation start"), {
      target: { value: "2024-01-01" }
    });
    fireEvent.change(screen.getByLabelText("Evaluation end"), {
      target: { value: "2024-01-03" }
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE COMPOSITE" }));

    await waitFor(() => expect(createComposite).toHaveBeenCalledTimes(1));
    expect(createComposite).toHaveBeenCalledWith(expect.objectContaining({
      name: "Real composite",
      components: [
        { id: "catalog-one", version: "1.2.0", parameters: {} },
        { id: "catalog-two", version: "2.0.0", parameters: {} }
      ]
    }));
    await waitFor(() => expect(evaluateComposite).toHaveBeenCalledWith("composite-real", {
      provider: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startTime: Date.parse("2024-01-01T00:00:00.000Z"),
      endTime: Date.parse("2024-01-03T23:00:00.000Z")
    }));
    expect(await screen.findByText("buy")).toBeDefined();
  });

  it("shows the backend parameter-validation message", async () => {
    vi.mocked(getStrategies).mockResolvedValue({ strategies: STRATEGIES });
    vi.mocked(createComposite).mockRejectedValue(
      new Error("COMPONENT_INVALID: STRATEGY_PARAMETER_RELATION")
    );

    render(<StrategyEnginePage />);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "+ ADD STRATEGY" })).toHaveLength(2));
    for (const button of screen.getAllByRole("button", { name: "+ ADD STRATEGY" })) {
      fireEvent.click(button);
    }
    fireEvent.change(screen.getByPlaceholderText("e.g. Alpha Trend 2.0"), {
      target: { value: "Invalid composite" }
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE COMPOSITE" }));

    expect(await screen.findByText("COMPONENT_INVALID: STRATEGY_PARAMETER_RELATION"))
      .toBeDefined();
  });
});
