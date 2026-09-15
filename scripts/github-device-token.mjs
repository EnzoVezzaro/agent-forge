#!/usr/bin/env node
/**
 * Get (or refresh) a GitHub App user access token via the OAuth Device Flow.
 *
 *   npm run gh:token        # prints a code → authorize at github.com/login/device
 *
 * Writes the token to `.env` as GITHUB_TOKEN (gitignored). App user tokens
 * expire (8h by default — uncheck "Expire user authorization tokens" in the
 * GitHub App settings for long-lived ones), so re-run whenever the CLI
 * reports 401/403.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID || "Iv23liXnwihcnEIdrvJl";
const ENV_FILE = path.join(process.cwd(), ".env");

const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const start = await post("https://github.com/login/device/code", { client_id: CLIENT_ID });
if (start.error) {
  console.error(`device flow unavailable: ${start.error} ${start.error_description ?? ""}`);
  console.error("Check that the GitHub App has Device Flow enabled.");
  process.exit(1);
}

console.log(`\n1. Open:  ${start.verification_uri}`);
console.log(`2. Code:  ${start.user_code}\n`);

const interval = (start.interval ?? 5) * 1000;
const deadline = Date.now() + (start.expires_in ?? 900) * 1000;
let token = null;
while (Date.now() < deadline && !token) {
  await new Promise((r) => setTimeout(r, interval));
  const res = await post("https://github.com/login/oauth/access_token", {
    client_id: CLIENT_ID,
    device_code: start.device_code,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  if (res.access_token) token = res.access_token;
  else if (res.error && !["authorization_pending", "slow_down"].includes(res.error)) {
    console.error(`error: ${res.error} ${res.error_description ?? ""}`);
    process.exit(1);
  }
}
if (!token) {
  console.error("error: device code expired before authorization");
  process.exit(1);
}

// Verify identity, then persist to .env (project) — gitignored.
const me = await fetch("https://api.github.com/user", {
  headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
}).then((r) => r.json());
if (!me.login) {
  console.error("error: token failed identity check");
  process.exit(1);
}

let env = "";
try {
  env = fs.readFileSync(ENV_FILE, "utf8");
} catch {
  console.warn("warning: no .env found — creating one from .env.example is recommended");
}
const line = `GITHUB_TOKEN=${token}`;
env = /^GITHUB_TOKEN=.*$/m.test(env) ? env.replace(/^GITHUB_TOKEN=.*$/m, line) : `${env}\n${line}\n`;
fs.writeFileSync(ENV_FILE, env, { mode: 0o600 });
fs.chmodSync(ENV_FILE, 0o600);

console.log(`✓ Authorized as ${me.login}`);
console.log(`✓ GITHUB_TOKEN written to ${ENV_FILE} (${token.slice(0, 8)}…${token.slice(-4)})`);
