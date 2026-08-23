// Optional repository-root .env loading for host development commands.
// Explicit process variables retain precedence; a missing local file is valid in CI.
import { loadEnvFile } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface FileSystemError extends Error {
  readonly code?: string;
}

/** Loads one environment file and reports whether it existed. */
export function loadEnvFileIfPresent(envPath: string): boolean {
  try {
    loadEnvFile(envPath);
    return true;
  } catch (error: unknown) {
    if ((error as FileSystemError).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** Loads the repository-root .env file when a developer created one. */
export function loadRootEnvFile(): boolean {
  const moduleUrl = new URL(import.meta.url);
  const envPath =
    moduleUrl.protocol === "file:"
      ? fileURLToPath(new URL("../../../../.env", moduleUrl))
      : path.resolve(process.cwd(), ".env");

  return loadEnvFileIfPresent(envPath);
}
