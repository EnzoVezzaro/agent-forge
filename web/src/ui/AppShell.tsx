import React, { useCallback, useEffect, useState } from "react";
import { CatalogPage } from "./pages/CatalogPage.js";
import { CrewDetailPage } from "./pages/CrewDetailPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { BuildEntryPage } from "./pages/BuildEntryPage.js";
import { BuilderPage } from "./pages/BuilderPage.js";
import { PreviewPage } from "./pages/PreviewPage.js";
import { SettingsModal } from "./SettingsModal.js";
import { loadSettings, type AppSettings } from "../settings.js";
import { getAuthenticatedUser } from "../github.js";
import { GitHubAuth } from "./GitHubAuth.js";

export interface AppCtx {
  settings: AppSettings;
  navigate: (to: string) => void;
}

export function AppShell(props: { route: string; navigate: (to: string) => void }): React.JSX.Element {
  const { route, navigate } = props;
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null);

  useEffect(() => {
    const onChange = () => setSettings(loadSettings());
    window.addEventListener("proagents-settings-changed", onChange);
    return () => window.removeEventListener("proagents-settings-changed", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (settings.githubToken) {
      getAuthenticatedUser(settings.githubToken)
        .then((u) => {
          if (!cancelled) setUser({ login: u.login, avatar_url: u.avatar_url });
        })
        .catch(() => {
          if (!cancelled) setUser(null);
        });
    } else {
      setUser(null);
    }
    return () => {
      cancelled = true;
    };
  }, [settings.githubToken]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const ctx: AppCtx = { settings, navigate };

  let page: React.JSX.Element;
  if (route.startsWith("item/")) {
    page = <CrewDetailPage id={decodeURIComponent(route.slice("item/".length))} ctx={ctx} />;
  } else if (route.startsWith("preview/")) {
    page = <PreviewPage id={decodeURIComponent(route.slice("preview/".length))} ctx={ctx} />;
  } else if (route === "dashboard") {
    page = <DashboardPage ctx={ctx} user={user} onOpenSettings={openSettings} />;
  } else if (route === "build") {
    page = <BuildEntryPage ctx={ctx} navigate={navigate} />;
  } else if (route === "builder") {
    page = <BuilderPage ctx={ctx} />;
  } else {
    page = <CatalogPage ctx={ctx} />;
  }

  const nav = (to: string, label: string) => (
    <a
      href={`#/${to}`}
      style={{
        color: route === to || route.startsWith(to + "/") ? "var(--lime)" : "var(--cream-dim)",
        textDecoration: "none",
        fontWeight: route === to || route.startsWith(to + "/") ? 700 : 400,
      }}
    >
      {label}
    </a>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--cream)", fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "14px 28px",
          borderBottom: "1px solid var(--line)",
          background: "var(--ink-2)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <a href="#/catalog" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--cream)" }}>
          <img src="/proagents/app/logo.png" alt="ProAgents" width={28} height={28} style={{ borderRadius: 6 }} />
          <strong style={{ fontSize: 16 }}>ProAgents</strong>
          <span style={{ color: "var(--lime)", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>MARKETPLACE</span>
        </a>
        <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
          {nav("catalog", "Catalog")}
          {nav("dashboard", "Dashboard")}
          {nav("build", "Build a crew")}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <a
            href="https://github.com/sponsors/EnzoVezzaro"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--cream)", textDecoration: "none", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}
          >
            ♥ <span style={{ color: "var(--lime)", fontWeight: 700 }}>Donate</span>
          </a>
          <GitHubAuth user={user} />
          <button
            onClick={openSettings}
            style={{
              background: "transparent",
              color: "var(--cream-dim)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ⚙ Settings
          </button>
        </div>
      </header>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 80px" }}>{page}</main>
      <footer style={{ borderTop: "1px solid var(--line)", padding: "18px 28px", color: "var(--cream-dim)", fontSize: 12, textAlign: "center" }}>
        ProAgents Marketplace · fully open source (MIT) · runs entirely in your browser on GitHub Pages ·{" "}
        <a href="https://github.com/EnzoVezzaro/proagents" style={{ color: "var(--lime)" }}>
          source
        </a>{" "}·{" "}
        <a href="https://github.com/sponsors/EnzoVezzaro" style={{ color: "var(--lime)" }}>♥ Sponsor</a>{" "}·{" "}
        <a href="https://ko-fi.com/enzojuniorvezzaro" style={{ color: "var(--lime)" }}>☕ Ko-fi</a>
      </footer>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
