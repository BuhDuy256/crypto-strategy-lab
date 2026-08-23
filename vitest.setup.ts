// Loads the repository-root .env file before tests. CI and explicit shell
// variables still win because Node's environment-file loader does not overwrite
// values already present in the process environment.
import { loadRootEnvFile } from "./apps/backend/src/platform/root-env.js";

loadRootEnvFile();
