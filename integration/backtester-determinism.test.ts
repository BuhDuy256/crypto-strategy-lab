// Cross-process canonical-hash proof for deterministic trade simulation.

import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { Backtester } from "../apps/backend/src/modules/experiment/domain/backtester.js";
import { canonicalSha256 } from "../apps/backend/src/platform/canonical-json.js";
import { deterministicBacktestInput } from "./fixtures/backtester-fixture.js";

describe("backtester process determinism", () => {
  it("produces the same canonical trade hash in a separate process", () => {
    const local = canonicalSha256(new Backtester().run(deterministicBacktestInput).trades);
    const runner = fileURLToPath(new URL("./fixtures/run-backtester-fixture.ts", import.meta.url));
    const loader = fileURLToPath(
      new URL("../apps/backend/node_modules/tsx/dist/loader.mjs", import.meta.url)
    );
    const remote = execFileSync(process.execPath, [
      "--import",
      pathToFileURL(loader).href,
      runner
    ], {
      encoding: "utf8"
    });
    expect(remote).toBe(local);
  });
});
