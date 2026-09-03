import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  fromDateInputValue,
  toDateInputValue,
  truncateHash
} from "./format.js";

describe("formatPercent", () => {
  it("writes a ratio as a percentage", () => {
    expect(formatPercent(0.375)).toBe("37.5%");
    expect(formatPercent(-0.016544625269000062)).toBe("-1.65%");
    expect(formatPercent(0.06037465666053556)).toBe("6.04%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("reports a missing value instead of NaN", () => {
    expect(formatPercent(Number.NaN)).toBe("-");
  });
});

describe("formatMoney", () => {
  it("groups thousands and fixes the precision", () => {
    expect(formatMoney(79620.17)).toBe("79,620.17");
    expect(formatMoney(78053.377185)).toBe("78,053.38");
    expect(formatMoney(10000)).toBe("10,000.00");
  });
});

describe("formatNumber", () => {
  it("caps precision without padding", () => {
    expect(formatNumber(0.13531592821846766)).toBe("0.1353");
    expect(formatNumber(8)).toBe("8");
  });
});

describe("date formatting", () => {
  const instant = Date.parse("2026-08-29T15:00:00.000Z");

  it("formats a UTC calendar day", () => {
    expect(formatDate(instant)).toBe("Aug 29, 2026");
  });

  it("formats a UTC day and time", () => {
    expect(formatDateTime(instant)).toBe("Aug 29, 15:00");
  });

  it("round-trips a date input value", () => {
    expect(toDateInputValue(instant)).toBe("2026-08-29");
    expect(fromDateInputValue("2026-08-29", "start")).toBe(
      Date.parse("2026-08-29T00:00:00.000Z")
    );
    expect(fromDateInputValue("2026-08-29", "end")).toBe(
      Date.parse("2026-08-29T23:59:59.999Z")
    );
  });

  it("rejects an incomplete date entry", () => {
    expect(fromDateInputValue("", "start")).toBeNull();
    expect(fromDateInputValue("not-a-date", "start")).toBeNull();
  });
});

describe("truncateHash", () => {
  it("shortens a long identifier", () => {
    expect(
      truncateHash("309f924382485013441f7157b5646affb5ae3532d46d9321578af7dafc9fbe96")
    ).toBe("309f9243…9fbe96");
  });

  it("leaves a short identifier alone", () => {
    expect(truncateHash("mvp-metrics")).toBe("mvp-metrics");
  });
});
