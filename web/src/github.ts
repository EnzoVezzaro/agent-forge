/**
 * GitHub integration for the marketplace SPA.
 *
 * Auth: OAuth Device Flow with the ProAgents GitHub App's Client ID.
 * Device flow is designed for input-limited clients and — importantly for a
 * static site — requires NO client secret, so it is safe to ship.
 * The user opens github.com/login/device, enters the code, and we poll.
 */

/**
 * Client ID of the ProAgents GitHub App — public by design (device flow needs
 * no secret). Overridable via VITE_GITHUB_APP_CLIENT_ID at build time (see
 * .env.example) so forks can ship their own app without code changes.
 */
export const GITHUB_APP_CLIENT_ID: string =
  (import.meta.env.VITE_GITHUB_APP_CLIENT_ID as string | undefined) ?? "Iv23liXnwihcnEIdrvJl";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
}

export async function startDeviceFlow(): Promise<DeviceFlowStart> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: GITHUB_APP_CLIENT_ID, scope: "repo read:user" }),
  });
  if (!res.ok) throw new Error(`device flow start failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval: number;
    expires_in: number;
  };
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    interval: body.interval ?? 5,
    expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
  };
}

export type DeviceFlowResult =
  | { status: "pending" }
  | { status: "granted"; token: string }
  | { status: "denied"; reason: string };

export async function pollDeviceFlow(flow: DeviceFlowStart): Promise<DeviceFlowResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: GITHUB_APP_CLIENT_ID,
      device_code: flow.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (!res.ok) return { status: "pending" };
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (body.access_token) return { status: "granted", token: body.access_token };
  if (body.error === "authorization_pending" || body.error === "slow_down") return { status: "pending" };
  if (body.error === "expired_token") return { status: "denied", reason: "The device code expired — try again." };
  if (body.error) return { status: "denied", reason: body.error_description ?? body.error };
  return { status: "pending" };
}

// ---------------------------------------------------------------------------
// Authenticated API helpers
// ---------------------------------------------------------------------------

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "proagents-marketplace",
  };
}

export async function getAuthenticatedUser(token: string): Promise<{ login: string; name: string | null; avatar_url: string }> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GitHub user fetch failed: HTTP ${res.status}`);
  return (await res.json()) as { login: string; name: string | null; avatar_url: string };
}

export interface RepoInfo {
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
  permissions: { push?: boolean };
}

/** Repos the user can push to (affiliation filter keeps the list usable). */
export async function listUserRepos(token: string): Promise<RepoInfo[]> {
  const out: RepoInfo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${API}/user/repos?affiliation=owner,collaborator&per_page=100&sort=pushed&page=${page}`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error(`repo list failed: HTTP ${res.status}`);
    const batch = (await res.json()) as RepoInfo[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.filter((r) => r.permissions?.push !== false);
}

/** Read a file from the user's repo (returns null when missing). */
export async function getRepoFile(token: string, repo: string, path: string, ref?: string): Promise<{ content: string; sha: string } | null> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`file read failed: HTTP ${res.status}`);
  const body = (await res.json()) as { content: string; sha: string; encoding: string };
  return {
    content: body.encoding === "base64" ? atob(body.content.replace(/\n/g, "")) : body.content,
    sha: body.sha,
  };
}

/** Commit (create/update) a file in the user's repo via the Contents API. */
export async function putRepoFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha: string | null,
  branch?: string,
): Promise<void> {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(content)));
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: encoded,
      sha: sha ?? undefined,
      branch: branch ?? undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`commit failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

/** Count matching workers, needed by the preview prompt builder. */
export async function listRepoTree(token: string, repo: string, ref?: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/git/trees/${ref ?? "HEAD"}?recursive=1`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`tree fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { tree: Array<{ path: string; type: string }> };
  return body.tree.filter((e) => e.type === "blob").map((e) => e.path);
}
