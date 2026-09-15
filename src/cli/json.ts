/** Shared JSON output helper for CLI modules (single, parseable stdout line-block). */
export function jsonOut(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
