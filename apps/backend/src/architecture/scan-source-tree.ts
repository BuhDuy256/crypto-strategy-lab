// Scans real .ts source files under given repo-root-relative
// directories, extracts their import/export specifiers with a regex
// (no AST dependency needed for this codebase's plain ESM import
// style), and resolves relative specifiers to real files on disk.
//
// The output feeds the pure rule engine in `boundary-rules.ts`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ImportRecord, ScannedFile } from "./boundary-rules.js";

/**
 * Matches:
 *  - import ... from "spec";           export ... from "spec";
 *  - import type ... from "spec";      export type ... from "spec";
 *  - import "spec";                    (side-effect only)
 *  - import("spec")                    (dynamic import)
 */
const STATIC_IMPORT_FROM = /(?:import|export)(?:[^'"();]*?)from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /^\s*import\s*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const pattern of [STATIC_IMPORT_FROM, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
  }
  return specifiers;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** Recursively lists every `.ts` file under `dirAbs`, excluding node_modules/dist and `.d.ts` files. */
function listTsFiles(dirAbs: string): string[] {
  if (!existsSync(dirAbs)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of readdirSync(dirAbs)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") {
      continue;
    }
    const entryAbs = path.join(dirAbs, entry);
    const stats = statSync(entryAbs);
    if (stats.isDirectory()) {
      results.push(...listTsFiles(entryAbs));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      results.push(entryAbs);
    }
  }
  return results;
}

/**
 * Resolves a relative import specifier written from `fromFileAbs` to
 * an absolute file path on disk, following this codebase's NodeNext
 * convention of `.js`-suffixed relative specifiers for `.ts` sources.
 * Returns null if no matching file exists.
 */
function resolveRelativeSpecifier(fromFileAbs: string, specifier: string): string | null {
  const fromDir = path.dirname(fromFileAbs);
  const target = path.resolve(fromDir, specifier);

  const candidates: string[] = [];
  if (target.endsWith(".js")) {
    candidates.push(`${target.slice(0, -3)}.ts`);
  }
  candidates.push(target);
  candidates.push(`${target}.ts`);
  candidates.push(path.join(target, "index.ts"));

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Scans every `.ts` file under each of `dirsRepoRelative` (relative to
 * `repoRootAbs`) and returns each file's import edges, with relative
 * specifiers resolved to repo-root-relative POSIX paths.
 */
export function scanSourceTree(repoRootAbs: string, dirsRepoRelative: readonly string[]): ScannedFile[] {
  const files: ScannedFile[] = [];

  for (const dirRelative of dirsRepoRelative) {
    const dirAbs = path.join(repoRootAbs, dirRelative);
    for (const fileAbs of listTsFiles(dirAbs)) {
      const source = readFileSync(fileAbs, "utf8");
      const specifiers = extractSpecifiers(source);

      const imports: ImportRecord[] = specifiers.map((specifier) => {
        if (!specifier.startsWith(".")) {
          return { specifier, resolvedPath: null };
        }
        const resolvedAbs = resolveRelativeSpecifier(fileAbs, specifier);
        const resolvedPath = resolvedAbs === null ? null : toPosix(path.relative(repoRootAbs, resolvedAbs));
        return { specifier, resolvedPath };
      });

      files.push({
        path: toPosix(path.relative(repoRootAbs, fileAbs)),
        imports
      });
    }
  }

  return files;
}
