/**
 * Catalog URLs — derived from Vite's BASE_URL instead of fragile
 * window.location relative-path math.
 *
 * BASE_URL is "/proagents/app/" on Pages and "/" in dev. The catalog lives at
 * the dist root (/.marketplace/), i.e. one level above the app base:
 *
 *   /proagents/app/  →  /proagents/.marketplace/…
 *   /                →  /.marketplace/…
 */

const APP_BASE = new URL(import.meta.env.BASE_URL, window.location.href).href;
/** Site root that serves the dist: one level up from the app base. */
const SITE_ROOT = new URL("../", APP_BASE).href;

/** Full URL of a catalog file: "catalog.json" or "items/<id>.json". */
export function catalogUrl(file: string): string {
  return new URL(`.marketplace/${file}`, SITE_ROOT).href;
}

export const CATALOG_URL = catalogUrl("catalog.json");
