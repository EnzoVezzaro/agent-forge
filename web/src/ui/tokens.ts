import React from "react";

/**
 * Design tokens — the marketplace SPA's craft floor. Everything interactive
 * gets: keyboard focus rings, hover/active feedback, transition curves, and
 * a consistent type ramp. Dark ink-and-lime world per the brand logo.
 */

export const focusRing: React.CSSProperties["outline"] = undefined;

/** Spread onto any interactive element for a11y focus + consistent cursor. */
export const interactive = {
  cursor: "pointer",
  transition: "border-color .15s ease, background .15s ease, color .15s ease, transform .1s ease",
  outline: "none",
} as const;

export function focusStyle(e: React.FocusEvent<HTMLElement>): void {
  e.currentTarget.style.boxShadow = "0 0 0 2px var(--ink), 0 0 0 4px var(--lime)";
}
export function blurStyle(e: React.FocusEvent<HTMLElement>): void {
  e.currentTarget.style.boxShadow = "none";
}

/** Consistent focus handling for buttons/links/inputs. */
export function focusProps(): {
  onFocus: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLElement>) => void;
  tabIndex?: number;
} {
  return { onFocus: focusStyle, onBlur: blurStyle };
}

/** Primary button (lime). */
export const btnPrimary: React.CSSProperties = {
  ...interactive,
  background: "var(--lime)",
  color: "#0a0a0a",
  border: "1px solid var(--lime)",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "inherit",
};

/** Secondary/ghost button. */
export const btnGhost: React.CSSProperties = {
  ...interactive,
  background: "transparent",
  color: "var(--cream-dim)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "10px 16px",
  fontWeight: 600,
  fontSize: 13,
  fontFamily: "inherit",
};

export const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--ink)",
  color: "var(--cream)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  transition: "border-color .15s ease",
};

export const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--cream-dim)",
  marginBottom: 5,
  marginTop: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  fontWeight: 600,
};

export const card: React.CSSProperties = {
  background: "var(--ink-2)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  padding: 20,
};

/** Type ramp. */
export const type = {
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px" } as React.CSSProperties,
  h2: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: "28px 0 10px" } as React.CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, margin: "0 0 8px" } as React.CSSProperties,
  body: { fontSize: 14, lineHeight: 1.65, color: "var(--cream-dim)" } as React.CSSProperties,
  small: { fontSize: 12.5, lineHeight: 1.55, color: "var(--cream-dim)" } as React.CSSProperties,
};
