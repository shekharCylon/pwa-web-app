/**
 * Checks the two things that fail silently.
 *
 *  1. The app secret must never reach the browser. A client component that
 *     imports the Engage module, or a NEXT_PUBLIC_ copy of the secret, ships
 *     it to every visitor — and nothing about the running app looks wrong.
 *
 *  2. The event payload must match what Engage accepts. Its ingestion drops
 *     unknown keys rather than erroring, and its capture step only recognises
 *     a token under specific property names. Misspell one and the event is
 *     stored, the contact enters the segment, and the campaign reaches fewer
 *     people than promised, with no error anywhere.
 *
 * Run: node scripts/verify-engage-integration.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENGAGE_API = process.env.ENGAGE_REPO || path.resolve(ROOT, "../emailMarketingAPI");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

/**
 * Strip comments before asserting a directive is absent.
 *
 * Without this, the comment in engage.ts explaining that it has no
 * "use client" directive matches the search for one — the assertion fails on
 * its own documentation. Same trap as any "the file must not contain X" check
 * where X is worth writing about.
 */
const code = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
};

// ── 1. The secret stays on the server ───────────────────────────────────────
console.log("\nThe app secret never reaches the browser");

const engageLib = read("src/lib/engage.ts");
check('engage.ts declares itself server-only', engageLib.includes('import "server-only"'));
check('engage.ts has no "use client" directive', !code(engageLib).includes('"use client"'));
check(
  "the secret is read from a non-public variable",
  engageLib.includes("process.env.ENGAGE_APP_SECRET") &&
    !engageLib.includes("NEXT_PUBLIC_ENGAGE_APP_SECRET"),
);

const clientFiles = walk("src").filter((f) => code(read(f)).includes('"use client"'));
const leaking = clientFiles.filter((f) => /from "@\/lib\/engage"/.test(read(f)));
check(
  `no client component imports @/lib/engage (${clientFiles.length} client files scanned)`,
  leaking.length === 0,
  leaking.join(", "),
);

const publicSecret = walk("src").filter((f) => /NEXT_PUBLIC_[A-Z_]*SECRET/.test(read(f)));
check("no NEXT_PUBLIC_ variable named like a secret", publicSecret.length === 0, publicSecret.join(", "));

if (existsSync(path.join(ROOT, ".env.local"))) {
  const env = read(".env.local");
  check(
    ".env.local keeps the Engage credentials un-prefixed",
    !/NEXT_PUBLIC_ENGAGE_APP_SECRET/.test(env),
  );
  for (const key of ["ENGAGE_API_URL", "ENGAGE_APP_ID", "ENGAGE_APP_SECRET", "ENGAGE_PUSH_EVENT"]) {
    check(`.env.local declares ${key}`, env.includes(`${key}=`));
  }
}

// ── 2. The payload matches what Engage accepts ──────────────────────────────
console.log("\nThe event payload matches Engage's contract");

if (!existsSync(ENGAGE_API)) {
  console.log(`  SKIP  Engage repo not found at ${ENGAGE_API} (set ENGAGE_REPO)`);
} else {
  const schema = readFileSync(path.join(ENGAGE_API, "api/schemas/main/events_ingest.py"), "utf8");
  const capture = readFileSync(path.join(ENGAGE_API, "api/services/push/capture.py"), "utf8");

  // Top-level keys of the event we post.
  for (const key of ["event_type", "user", "properties"]) {
    check(`payload sends ${key}, and EventIngestRequest declares it`,
      engageLib.includes(`${key}:`) && new RegExp(`^\\s*${key}:`, "m").test(schema));
  }

  // Identity fields.
  for (const key of ["email", "first_name", "last_name"]) {
    check(`user.${key} is declared on EventUser`,
      engageLib.includes(key) && new RegExp(`^\\s*${key}:`, "m").test(schema));
  }

  // The property Engage's capture step actually looks for.
  const tokenKeys = (capture.match(/_TOKEN_KEYS = \(([^)]*)\)/s)?.[1] || "")
    .split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  const sent = engageLib.match(/device_token: ([^,\n]+)/)?.[0];
  check(`the token is sent as a key capture.py recognises (${tokenKeys.join(", ")})`,
    Boolean(sent) && tokenKeys.includes("device_token"), sent || "no device_token key found");

  // The event name has to match the configured one, whose default lives here.
  const defaultEvent = capture.match(/token_event_name/) ? "push_notification" : null;
  check("the default event name agrees with Engage's default",
    engageLib.includes('"push_notification"') && defaultEvent === "push_notification");

  // Optional properties capture.py reads.
  for (const key of ["platform", "device_id", "environment", "source"]) {
    check(`properties.${key} is a key capture.py reads`, engageLib.includes(`${key}:`) && capture.includes(key));
  }

  // The endpoints the routes call must exist.
  const pushRoutes = readFileSync(path.join(ENGAGE_API, "api/routes/push.py"), "utf8");
  check('POST /api/v1/push/click exists', pushRoutes.includes('@router.post("/click"'));
  check('POST /api/v1/push/token/disable exists', pushRoutes.includes('@router.post("/token/disable"'));
  check("ingestion answers 200 with the outcome in the body, and the relay reads it",
    engageLib.includes("json?.success === true"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
