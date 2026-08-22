// Pure architecture boundary rule engine.
//
// This file has no filesystem access. It takes an already-scanned list
// of source files (each with its resolved import edges) and reports
// which of the six frozen boundary rules those edges violate. Keeping
// this pure makes each rule independently unit-testable with small
// synthetic fixtures, separate from the real repository scan in
// `scan-source-tree.ts`.
//
// Authoritative source for these six rules:
// - docs/architecture/architecture-baseline.md
//   ("Allowed dependency directions", "NestJS realization invariants" 2-6)
// - docs/adr/ADR-001-modular-monolith-process-roles.md ("Evidence")
// - docs/diagrams/05-module-boundaries.md (forbidden-examples table)

/** One import found in a scanned source file. */
export interface ImportRecord {
  /** The raw specifier as written in the import/export statement, e.g. "../market/index.js" or "@nestjs/common". */
  readonly specifier: string;
  /**
   * For a relative import that resolved to a real file on disk, the
   * repo-root-relative POSIX path of that file (e.g.
   * "apps/backend/src/modules/market/index.ts"). `null` for a bare
   * package specifier, or a relative specifier that could not be
   * resolved to a file under the scanned trees.
   */
  readonly resolvedPath: string | null;
}

/** One scanned source file and the imports it contains. */
export interface ScannedFile {
  /** Repo-root-relative POSIX path, e.g. "apps/backend/src/app.module.ts". */
  readonly path: string;
  readonly imports: readonly ImportRecord[];
}

export type BoundaryRuleId =
  | "BOUND-1-INDEX-ONLY"
  | "BOUND-2-ALLOWED-EDGE"
  | "BOUND-3-DOMAIN-PURITY"
  | "BOUND-4-PLATFORM-NO-MODULES"
  | "BOUND-5-NO-INTERNAL-REACH"
  | "BOUND-6-WEB-CONTRACTS-ONLY";

export interface BoundaryViolation {
  readonly rule: BoundaryRuleId;
  readonly file: string;
  readonly specifier: string;
  readonly message: string;
}

const BACKEND_MODULES_PREFIX = "apps/backend/src/modules/";
const PLATFORM_PREFIX = "apps/backend/src/platform/";
const WEB_SRC_PREFIX = "apps/web/src/";
const BACKEND_SRC_PREFIX = "apps/backend/src/";

/**
 * Allowed cross-module edges (rule 2). Every module-to-module edge not
 * listed here is forbidden. API is allowed to reach every module;
 * Experiment is allowed to reach Strategy, Market, and News.
 *
 * Extend this map, do not replace it, when a later baseline version
 * adds a module edge.
 */
export const ALLOWED_MODULE_EDGES: Readonly<Record<string, readonly string[]>> = {
  api: ["market", "strategy", "experiment", "news"],
  experiment: ["strategy", "market", "news"]
};

/**
 * Bare package specifiers (or specifier prefixes) forbidden inside a
 * `domain/` directory (rule 3): NestJS, HTTP clients, database
 * libraries, queue libraries, and provider SDKs.
 *
 * Extend this list, do not replace it, when a later slice introduces a
 * new technology in one of these categories.
 */
export const FORBIDDEN_DOMAIN_PACKAGE_PREFIXES: readonly string[] = [
  // NestJS
  "@nestjs",
  // HTTP clients
  "http",
  "https",
  "axios",
  "node-fetch",
  "undici",
  "got",
  "ky",
  // database libraries
  "pg",
  "pg-promise",
  "mysql",
  "mysql2",
  "sqlite3",
  "typeorm",
  "prisma",
  "@prisma/client",
  "knex",
  "sequelize",
  "mongoose",
  "mongodb",
  // queue libraries
  "bullmq",
  "ioredis",
  "redis",
  "amqplib",
  "kafkajs",
  // provider SDKs
  "ccxt",
  "binance",
  "@binance/connector",
  "aws-sdk",
  "@aws-sdk"
];

const WEB_FORBIDDEN_PACKAGE_PREFIXES: readonly string[] = ["@crypto-strategy-lab/messaging-contracts"];

/** Extracts the module name segment from a `apps/backend/src/modules/<name>/...` path, or null. */
function moduleNameOf(repoRelativePath: string): string | null {
  if (!repoRelativePath.startsWith(BACKEND_MODULES_PREFIX)) {
    return null;
  }
  const rest = repoRelativePath.slice(BACKEND_MODULES_PREFIX.length);
  const separatorIndex = rest.indexOf("/");
  return separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
}

function isModuleIndexFile(repoRelativePath: string, moduleName: string): boolean {
  return repoRelativePath === `${BACKEND_MODULES_PREFIX}${moduleName}/index.ts`;
}

function isUnderModuleSubfolder(repoRelativePath: string, moduleName: string, subfolder: string): boolean {
  return repoRelativePath.startsWith(`${BACKEND_MODULES_PREFIX}${moduleName}/${subfolder}/`);
}

function barePackageNameOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return null;
  }
  // Node built-ins like "node:http" — normalize away the "node:" prefix
  // so they match the same blocklist entries as their unprefixed form.
  const withoutNodePrefix = specifier.startsWith("node:") ? specifier.slice("node:".length) : specifier;
  if (withoutNodePrefix.startsWith("@")) {
    const parts = withoutNodePrefix.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : withoutNodePrefix;
  }
  const separatorIndex = withoutNodePrefix.indexOf("/");
  return separatorIndex === -1 ? withoutNodePrefix : withoutNodePrefix.slice(0, separatorIndex);
}

function matchesForbiddenPrefix(packageName: string, forbiddenPrefixes: readonly string[]): boolean {
  return forbiddenPrefixes.some((prefix) => packageName === prefix || packageName.startsWith(`${prefix}/`));
}

/**
 * Checks every import edge in `files` against the six frozen boundary
 * rules and returns every violation found. An empty array means the
 * scanned tree is clean.
 */
export function checkBoundaries(files: readonly ScannedFile[]): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  for (const file of files) {
    const fromModule = moduleNameOf(file.path);
    const fromIsDomain = file.path.includes("/domain/");
    const fromIsPlatform = file.path.startsWith(PLATFORM_PREFIX);
    const fromIsWeb = file.path.startsWith(WEB_SRC_PREFIX);

    for (const imp of file.imports) {
      const { specifier, resolvedPath } = imp;

      // Rule 3: domain/ purity — no NestJS, HTTP client, database,
      // queue, or provider SDK bare imports.
      if (fromIsDomain) {
        const packageName = barePackageNameOf(specifier);
        if (packageName !== null && matchesForbiddenPrefix(packageName, FORBIDDEN_DOMAIN_PACKAGE_PREFIXES)) {
          violations.push({
            rule: "BOUND-3-DOMAIN-PURITY",
            file: file.path,
            specifier,
            message:
              `${file.path} imports "${specifier}" from a domain/ path. ` +
              `Rule BOUND-3-DOMAIN-PURITY: domain/ must not import NestJS, HTTP clients, ` +
              `database libraries, queue libraries, or provider SDKs.`
          });
        }
      }

      if (resolvedPath !== null) {
        const targetModule = moduleNameOf(resolvedPath);

        // Rule 1: cross-module imports must go through the target
        // module's index.ts. Applies whenever the import crosses into
        // a different module's tree than the importing file's own
        // module (including from files outside any module, e.g.
        // platform/ or root composition files).
        if (targetModule !== null && targetModule !== fromModule && !isModuleIndexFile(resolvedPath, targetModule)) {
          violations.push({
            rule: "BOUND-1-INDEX-ONLY",
            file: file.path,
            specifier,
            message:
              `${file.path} imports "${specifier}" (resolved: ${resolvedPath}), which reaches ` +
              `into the "${targetModule}" module without going through its index.ts. ` +
              `Rule BOUND-1-INDEX-ONLY: a module may only be imported through its index.ts.`
          });
        }

        // Rule 2: allowed cross-module edges only. Only evaluated when
        // the importing file itself belongs to one of the five
        // modules (root composition files like app.module.ts are not
        // a logical module and are not edge-restricted).
        if (
          fromModule !== null &&
          targetModule !== null &&
          targetModule !== fromModule &&
          isModuleIndexFile(resolvedPath, targetModule)
        ) {
          const allowedTargets = ALLOWED_MODULE_EDGES[fromModule] ?? [];
          if (!allowedTargets.includes(targetModule)) {
            violations.push({
              rule: "BOUND-2-ALLOWED-EDGE",
              file: file.path,
              specifier,
              message:
                `${file.path} imports "${specifier}" (module "${fromModule}" -> module "${targetModule}"). ` +
                `Rule BOUND-2-ALLOWED-EDGE: this cross-module edge is not in the allowed list ` +
                `(API -> any module; Experiment -> Strategy, Market, News). Every other edge is forbidden.`
            });
          }
        }

        // Rule 4: platform/ must not import from any modules/ directory.
        if (fromIsPlatform && resolvedPath.startsWith(BACKEND_MODULES_PREFIX)) {
          violations.push({
            rule: "BOUND-4-PLATFORM-NO-MODULES",
            file: file.path,
            specifier,
            message:
              `${file.path} imports "${specifier}" (resolved: ${resolvedPath}) from platform/. ` +
              `Rule BOUND-4-PLATFORM-NO-MODULES: platform/ must not import from any modules/ directory.`
          });
        }

        // Rule 5: nothing outside a module may import its
        // infrastructure/ or domain/ paths directly.
        if (targetModule !== null && targetModule !== fromModule) {
          const reachesInfrastructure = isUnderModuleSubfolder(resolvedPath, targetModule, "infrastructure");
          const reachesDomain = isUnderModuleSubfolder(resolvedPath, targetModule, "domain");
          if (reachesInfrastructure || reachesDomain) {
            const reachedKind = reachesInfrastructure ? "infrastructure/" : "domain/";
            violations.push({
              rule: "BOUND-5-NO-INTERNAL-REACH",
              file: file.path,
              specifier,
              message:
                `${file.path} imports "${specifier}" (resolved: ${resolvedPath}), reaching directly ` +
                `into "${targetModule}" module's ${reachedKind} from outside that module. ` +
                `Rule BOUND-5-NO-INTERNAL-REACH: nothing outside a module may import its ` +
                `infrastructure/ or domain/ paths directly.`
            });
          }
        }

        // Rule 6 (backend-import half): apps/web must never import
        // anything under apps/backend.
        if (fromIsWeb && resolvedPath.startsWith(BACKEND_SRC_PREFIX)) {
          violations.push({
            rule: "BOUND-6-WEB-CONTRACTS-ONLY",
            file: file.path,
            specifier,
            message:
              `${file.path} imports "${specifier}" (resolved: ${resolvedPath}) from apps/backend. ` +
              `Rule BOUND-6-WEB-CONTRACTS-ONLY: apps/web may import packages/api-contracts but ` +
              `never apps/backend, and never packages/messaging-contracts.`
          });
        }
      }

      // Rule 6 (messaging-contracts half): apps/web must never import
      // packages/messaging-contracts, even before that package exists.
      if (fromIsWeb) {
        const packageName = barePackageNameOf(specifier);
        if (packageName !== null && matchesForbiddenPrefix(packageName, WEB_FORBIDDEN_PACKAGE_PREFIXES)) {
          violations.push({
            rule: "BOUND-6-WEB-CONTRACTS-ONLY",
            file: file.path,
            specifier,
            message:
              `${file.path} imports "${specifier}". ` +
              `Rule BOUND-6-WEB-CONTRACTS-ONLY: apps/web may import packages/api-contracts but ` +
              `never packages/messaging-contracts, and never apps/backend.`
          });
        }
      }
    }
  }

  return violations;
}
