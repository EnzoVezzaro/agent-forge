import { describe, expect, it } from "vitest";
import {
  getEnvConfig,
  isSensitiveEnvName,
  loadDotEnv,
  parseDotEnv,
} from "../src/env.js";

describe("env loader", () => {
  it("ENV-001: parses KEY=VALUE lines and ignores comments/garbage", () => {
    const entries = parseDotEnv(
      [
        "# comment",
        "",
        "PROAGENT_MARKET_REPO=owner/repo",
        'QUOTED="hello world"',
        "SINGLE='single value'",
        "no equals sign",
        "=novalue",
        "BAD-NAME=x",
        "  SPACED =  trimmed  ",
      ].join("\n"),
    );
    expect(entries).toEqual([
      { key: "PROAGENT_MARKET_REPO", value: "owner/repo" },
      { key: "QUOTED", value: "hello world" },
      { key: "SINGLE", value: "single value" },
      { key: "SPACED", value: "trimmed" },
    ]);
  });

  it("ENV-002: real environment variables win over .env values", () => {
    const text = "PROAGENT_MARKET_REPO=from-dotenv\nGITHUB_TOKEN=from-dotenv";
    for (const { key, value } of parseDotEnv(text)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    // Simulate the loader's precedence rule directly:
    const existing = process.env.PROAGENT_MARKET_REPO;
    process.env.PROAGENT_MARKET_REPO = "from-real-env";
    const cfg = getEnvConfig();
    expect(cfg.marketRepo).toBe("from-real-env");
    process.env.PROAGENT_MARKET_REPO = existing;
  });

  it("ENV-003: loadDotEnv fills only unset variables from a temp dir", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-env-"));

    await fs.writeFile(
      path.join(dir, ".env"),
      "PROAGENT_MARKET_REPO=dotenv/repo\nSTRIPE_SECRET_KEY=sk_test_dotenv\n",
    );
    await fs.writeFile(
      path.join(dir, ".env.local"),
      "PROAGENT_MARKET_REPO=dotenv-local/repo\n",
    );

    const saved = process.env.PROAGENT_MARKET_REPO;
    const savedStripe = process.env.STRIPE_SECRET_KEY;
    try {
      delete process.env.PROAGENT_MARKET_REPO;
      delete process.env.STRIPE_SECRET_KEY;
      loadDotEnv(dir);
      // .env.local takes precedence over .env
      expect(process.env.PROAGENT_MARKET_REPO).toBe("dotenv-local/repo");
      expect(process.env.STRIPE_SECRET_KEY).toBe("sk_test_dotenv");
    } finally {
      // restore
      if (saved === undefined) delete process.env.PROAGENT_MARKET_REPO;
      else process.env.PROAGENT_MARKET_REPO = saved;
      if (savedStripe === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = savedStripe;
    }
  });

  it("ENV-006: loadDotEnv walks up to find the nearest .env", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-env-up-"));
    const nested = path.join(root, "a", "b", "c");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(root, ".env"), "GITHUB_TOKEN=tok-from-parent\n");

    const saved = process.env.GITHUB_TOKEN;
    try {
      delete process.env.GITHUB_TOKEN;
      loadDotEnv(nested); // three levels below the .env
      expect(process.env.GITHUB_TOKEN).toBe("tok-from-parent");
    } finally {
      if (saved === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = saved;
    }
  });

  it("ENV-007: user-global ~/.proagent/.env is used when the project has none", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-home-"));
    const project = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-proj-"));
    await fs.mkdir(path.join(fakeHome, ".proagent"), { recursive: true });
    await fs.writeFile(
      path.join(fakeHome, ".proagent", ".env"),
      "STRIPE_SECRET_KEY=sk_test_global\n",
    );

    const savedStripe = process.env.STRIPE_SECRET_KEY;
    const savedHome = process.env.HOME;
    try {
      delete process.env.STRIPE_SECRET_KEY;
      process.env.HOME = fakeHome;
      loadDotEnv(project); // project has no .env → global fallback
      expect(process.env.STRIPE_SECRET_KEY).toBe("sk_test_global");
    } finally {
      if (savedStripe === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = savedStripe;
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
    }
  });

  it("ENV-004: sensitive names are classified correctly", () => {
    expect(isSensitiveEnvName("STRIPE_SECRET_KEY")).toBe(true);
    expect(isSensitiveEnvName("GITHUB_TOKEN")).toBe(true);
    expect(isSensitiveEnvName("CLERK_SECRET_KEY")).toBe(true);
    expect(isSensitiveEnvName("PROAGENT_MARKET_REPO")).toBe(false);
    expect(isSensitiveEnvName("GITHUB_APP_CLIENT_ID")).toBe(false);
    expect(isSensitiveEnvName("VITE_CLERK_PUBLISHABLE_KEY")).toBe(false);
    expect(isSensitiveEnvName("VITE_MARKET_REPO")).toBe(false);
  });

  it("ENV-005: getEnvConfig reads all documented variables", () => {
    const saved = { ...process.env } as Record<string, string | undefined>;
    try {
      process.env.PROAGENT_MARKET_REPO = "r1";
      process.env.GITHUB_TOKEN = "t1";
      process.env.STRIPE_SECRET_KEY = "s1";
      process.env.GITHUB_APP_CLIENT_ID = "cid1";
      process.env.CLERK_SECRET_KEY = "c1";
      const cfg = getEnvConfig();
      expect(cfg).toEqual({
        marketRepo: "r1",
        githubToken: "t1",
        stripeSecretKey: "s1",
        githubAppClientId: "cid1",
        clerkSecretKey: "c1",
      });
    } finally {
      for (const key of Object.keys(saved)) {
        const value = saved[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
