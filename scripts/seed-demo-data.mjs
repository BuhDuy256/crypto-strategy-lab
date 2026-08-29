// Loads the market data the demo pages actually ask for.
//
// Every page derives its default window from the current time: Realtime shows the
// last 150 candles per timeframe, Backtest and Discovery open on a recent range.
// The backfill CLI takes an explicit range, so preparing a demo by hand means
// working out four epoch windows first. That is the hidden step this removes.
//
// Run it after the stack is up:
//   docker compose exec api pnpm run demo:seed
//
// It is a wrapper around the existing Market backfill CLI, not a second ingest
// path: it only computes windows and calls that CLI once per timeframe.

import { spawn } from "node:child_process";

const TIMEFRAME_MILLISECONDS = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000
};

const SYMBOL = "BTCUSDT";
// Thirty days covers the widest default any page opens with (the Strategy Engine
// evaluation window) and leaves the 150-candle chart widgets well inside it.
const DAYS = 30;

function windowFor(timeframe, now) {
  const duration = TIMEFRAME_MILLISECONDS[timeframe];
  // End on the last candle that has certainly closed, so the range never asks the
  // provider for a candle that is still forming.
  const endTime = Math.floor(now / duration) * duration - duration;
  return { startTime: endTime - DAYS * 86_400_000, endTime };
}

function backfill(timeframe, startTime, endTime) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@crypto-strategy-lab/backend", "run", "market:backfill", "--",
       "--symbol", SYMBOL, "--timeframe", timeframe,
       "--startTime", String(startTime), "--endTime", String(endTime)],
      { stdio: "inherit", shell: process.platform === "win32" }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`backfill ${timeframe} exited with code ${code}`));
    });
  });
}

const now = Date.now();
console.log(`Seeding ${DAYS} days of ${SYMBOL} candles ending at ${new Date(now).toISOString()}.`);
for (const timeframe of Object.keys(TIMEFRAME_MILLISECONDS)) {
  const { startTime, endTime } = windowFor(timeframe, now);
  console.log(`\n${timeframe}: ${new Date(startTime).toISOString()} -> ${new Date(endTime).toISOString()}`);
  await backfill(timeframe, startTime, endTime);
}
console.log("\nDemo data ready. Open http://localhost:8080 and every page opens on data.");
