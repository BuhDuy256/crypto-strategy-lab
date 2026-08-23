import { Backtester } from "../../apps/backend/src/modules/experiment/domain/backtester.js";
import { canonicalSha256 } from "../../apps/backend/src/platform/canonical-json.js";
import { deterministicBacktestInput } from "./backtester-fixture.js";

process.stdout.write(canonicalSha256(new Backtester().run(deterministicBacktestInput).trades));
