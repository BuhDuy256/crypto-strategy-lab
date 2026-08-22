// Architecture boundary test.
//
// Two things happen here:
//
// 1. An integration check scans the real `apps/backend/src` and
//    `apps/web/src` trees and asserts the six frozen boundary rules
//    (see boundary-rules.ts) hold across the whole codebase. This is
//    the guardrail: it runs as part of `pnpm run test`, so a
//    forbidden import breaks the build the moment it is added.
// 2. One unit test per rule feeds a small synthetic fixture directly
//    into the pure rule engine, proving each rule actually fires (and
//    keeps firing as the checker evolves) without leaving any
//    violating file behind in the scanned tree.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBoundaries, type ScannedFile } from "./boundary-rules.js";
import { scanSourceTree } from "./scan-source-tree.js";

/** Walks up from this file until it finds the repo root (marked by pnpm-workspace.yaml). */
function findRepoRoot(startDirAbs: string): string {
  let dir = startDirAbs;
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate repo root (pnpm-workspace.yaml not found in any ancestor directory).");
    }
    dir = parent;
  }
}

describe("architecture boundary rules (real source tree)", () => {
  it("has no boundary violations under apps/backend/src or apps/web/src", () => {
    const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    const files = scanSourceTree(repoRoot, ["apps/backend/src", "apps/web/src"]);
    const violations = checkBoundaries(files);

    expect(violations.map((v) => v.message)).toEqual([]);
  });
});

describe("architecture boundary rules (synthetic fixtures, one per rule)", () => {
  it("BOUND-1-INDEX-ONLY: fires when a module imports another module's internals instead of its index.ts", () => {
    const files: ScannedFile[] = [
      {
        path: "apps/backend/src/modules/experiment/experiment.module.ts",
        imports: [
          {
            specifier: "../market/market.module.js",
            resolvedPath: "apps/backend/src/modules/market/market.module.ts"
          }
        ]
      }
    ];

    const violations = checkBoundaries(files);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("BOUND-1-INDEX-ONLY");
    expect(violations[0]?.file).toBe("apps/backend/src/modules/experiment/experiment.module.ts");
    expect(violations[0]?.specifier).toBe("../market/market.module.js");
  });

  it("BOUND-2-ALLOWED-EDGE: fires on a module edge that is not in the allowed list", () => {
    const files: ScannedFile[] = [
      {
        path: "apps/backend/src/modules/market/market.module.ts",
        imports: [
          {
            specifier: "../strategy/index.js",
            resolvedPath: "apps/backend/src/modules/strategy/index.ts"
          }
        ]
      }
    ];

    const violations = checkBoundaries(files);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("BOUND-2-ALLOWED-EDGE");
    expect(violations[0]?.message).toContain('module "market" -> module "strategy"');
  });

  it("BOUND-3-DOMAIN-PURITY: fires when domain/ imports a forbidden technology package", () => {
    const files: ScannedFile[] = [
      {
        path: "apps/backend/src/modules/market/domain/example.ts",
        imports: [{ specifier: "@nestjs/common", resolvedPath: null }]
      }
    ];

    const violations = checkBoundaries(files);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("BOUND-3-DOMAIN-PURITY");
    expect(violations[0]?.specifier).toBe("@nestjs/common");
  });

  it("BOUND-4-PLATFORM-NO-MODULES: fires when platform/ imports from a modules/ directory", () => {
    const files: ScannedFile[] = [
      {
        path: "apps/backend/src/platform/example.ts",
        imports: [
          {
            specifier: "../modules/market/index.js",
            resolvedPath: "apps/backend/src/modules/market/index.ts"
          }
        ]
      }
    ];

    const violations = checkBoundaries(files);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("BOUND-4-PLATFORM-NO-MODULES");
  });

  it("BOUND-5-NO-INTERNAL-REACH: fires when a file outside a module imports its infrastructure/ or domain/ path directly", () => {
    const files: ScannedFile[] = [
      {
        path: "apps/backend/src/modules/experiment/experiment.module.ts",
        imports: [
          {
            specifier: "../market/infrastructure/example.js",
            resolvedPath: "apps/backend/src/modules/market/infrastructure/example.ts"
          }
        ]
      }
    ];

    const violations = checkBoundaries(files);

    // This edge also crosses into another module without going
    // through index.ts, so BOUND-1 fires too; BOUND-5 is the one
    // under test here.
    const rule5 = violations.filter((v) => v.rule === "BOUND-5-NO-INTERNAL-REACH");
    expect(rule5).toHaveLength(1);
    expect(rule5[0]?.message).toContain("infrastructure/");
  });

  it("BOUND-6-WEB-CONTRACTS-ONLY: fires when apps/web imports apps/backend, and when it imports messaging-contracts", () => {
    const filesImportingBackend: ScannedFile[] = [
      {
        path: "apps/web/src/example.ts",
        imports: [
          {
            specifier: "../../backend/src/app.module.js",
            resolvedPath: "apps/backend/src/app.module.ts"
          }
        ]
      }
    ];
    const backendViolations = checkBoundaries(filesImportingBackend);
    expect(backendViolations).toHaveLength(1);
    expect(backendViolations[0]?.rule).toBe("BOUND-6-WEB-CONTRACTS-ONLY");

    const filesImportingMessagingContracts: ScannedFile[] = [
      {
        path: "apps/web/src/example.ts",
        imports: [{ specifier: "@crypto-strategy-lab/messaging-contracts", resolvedPath: null }]
      }
    ];
    const messagingViolations = checkBoundaries(filesImportingMessagingContracts);
    expect(messagingViolations).toHaveLength(1);
    expect(messagingViolations[0]?.rule).toBe("BOUND-6-WEB-CONTRACTS-ONLY");

    const filesImportingApiContracts: ScannedFile[] = [
      {
        path: "apps/web/src/example.ts",
        imports: [{ specifier: "@crypto-strategy-lab/api-contracts", resolvedPath: null }]
      }
    ];
    expect(checkBoundaries(filesImportingApiContracts)).toEqual([]);
  });
});
