import React, { useEffect, useRef, useState } from "react";
import { pollDeviceFlow, startDeviceFlow, type DeviceFlowStart } from "../github.js";
import { loadSettings, saveSettings } from "../settings.js";

/**
 * GitHub sign-in via OAuth Device Flow (ProAgents GitHub App, client id only —
 * no secret in the bundle). Shows the one-time code, opens the verification
 * page, polls until granted.
 */

export function GitHubAuth(props: { user: { login: string; avatar_url: string } | null }): React.JSX.Element | null {
  const [flow, setFlow] = useState<DeviceFlowStart | null>(null);
  const [status, setStatus] = useState<string>("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  if (props.user) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <img src={props.user.avatar_url} alt={props.user.login} width={24} height={24} style={{ borderRadius: "50%" }} />
        <span style={{ color: "var(--cream)" }}>{props.user.login}</span>
        <button
          onClick={() => saveSettings({ ...loadSettings(), githubToken: "" })}
          style={{ background: "none", border: "none", color: "var(--cream-dim)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
        >
          sign out
        </button>
      </span>
    );
  }

  const start = async () => {
    try {
      const f = await startDeviceFlow();
      setFlow(f);
      setStatus(`Enter code ${f.userCode} at github.com/login/device`);
      window.open(f.verificationUri, "_blank");
      timer.current = window.setInterval(async () => {
        const result = await pollDeviceFlow(f);
        if (result.status === "granted") {
          if (timer.current) window.clearInterval(timer.current);
          saveSettings({ ...loadSettings(), githubToken: result.token });
          setFlow(null);
          setStatus("");
        } else if (result.status === "denied") {
          if (timer.current) window.clearInterval(timer.current);
          setStatus(result.reason);
          setFlow(null);
        }
      }, f.interval * 1000);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {status && <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>{status}</span>}
      {flow && flow.userCode && (
        <code style={{ background: "var(--ink)", border: "1px solid var(--lime)", color: "var(--lime)", padding: "3px 8px", borderRadius: 6, letterSpacing: 2 }}>
          {flow.userCode}
        </code>
      )}
      <button
        onClick={start}
        style={{
          background: "var(--lime)",
          color: "#000",
          border: "none",
          borderRadius: 8,
          padding: "7px 14px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Sign in with GitHub
      </button>
    </span>
  );
}
