// Loads lib/*.ts modules at runtime for the eval harness by transpiling them
// with the TypeScript compiler (already a devDependency). Resolves the
// "@/lib/..." path alias used inside the app. Dev tooling only; not for prod.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = require("typescript/lib/typescript.js");

const cache = new Map();

function resolveSpecifier(specifier, fromDir) {
  let base = null;
  if (specifier.startsWith("@/lib/")) {
    base = path.join(root, "lib", specifier.slice("@/lib/".length));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.resolve(fromDir, specifier);
  }
  if (!base) return null;
  for (const candidate of [`${base}.ts`, base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function loadModule(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const source = fs.readFileSync(absPath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const moduleObj = { exports: {} };
  cache.set(absPath, moduleObj.exports);

  const localRequire = (specifier) => {
    const resolved = resolveSpecifier(specifier, path.dirname(absPath));
    if (resolved) return loadModule(resolved);
    return require(specifier);
  };

  const fn = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    js,
  );
  fn.call(
    moduleObj.exports,
    moduleObj.exports,
    localRequire,
    moduleObj,
    absPath,
    path.dirname(absPath),
  );
  return moduleObj.exports;
}

export function loadLib(name) {
  return loadModule(path.join(root, "lib", `${name}.ts`));
}
