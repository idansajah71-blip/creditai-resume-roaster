import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every variable the checklist requires in .env.example.
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "PAYPAL_ENV",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "NEXT_PUBLIC_PAYPAL_BUYER_EMAIL",
  "NEXT_PUBLIC_PAYPAL_BUYER_PASSWORD",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_REPO_URL",
  "AI_DAILY_LIMIT_PER_USER",
  "AI_GLOBAL_DAILY_LIMIT",
  "PAYPAL_MAX_ORDERS_PER_DAY",
  "DEMO_SESSIONS_DAILY_LIMIT",
  "DEMO_IP_SALT",
];

function walker(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walker(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(p);
  }
}

function readEnvKeys(): string[] {
  const content = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => l.slice(0, l.indexOf("=")));
}

// NODE_ENV is managed by the runtime (Next.js/Vercel set it in dev/build/serve),
// not deployment config; putting it in an env file is explicitly unsupported.
const PLATFORM_MANAGED = new Set(["NODE_ENV"]);

function envUsages(): { file: string; name: string }[] {
  const files: string[] = [];
  for (const dir of ["app", "lib"]) walker(path.join(root, dir), files);
  if (fs.existsSync(path.join(root, "middleware.ts"))) files.push(path.join(root, "middleware.ts"));
  const re = /process\.env\.([A-Z0-9_]+)/g;
  const out: { file: string; name: string }[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (!PLATFORM_MANAGED.has(m[1])) out.push({ file: path.relative(root, f), name: m[1] });
    }
  }
  return out;
}

describe(".env.example completeness", () => {
  it("covers every process.env.X read by app/, lib/, middleware.ts", () => {
    const keys = new Set(readEnvKeys());
    const missing = envUsages().filter((u) => !keys.has(u.name));
    expect(missing).toEqual([]);
  });

  it("lists all required variables exactly once", () => {
    const keys = readEnvKeys();
    const missing = REQUIRED.filter((k) => !keys.includes(k));
    expect(missing).toEqual([]);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });
});
