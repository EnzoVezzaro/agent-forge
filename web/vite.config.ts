import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: the app is served from /proagents/app/.
// envDir points at the repo root so one .env file serves both the CLI
// (secrets, gitignored) and the web build (only VITE_* vars are embedded —
// they must never hold secrets).
export default defineConfig({
  base: "/proagents/app/",
  envDir: "..",
  envPrefix: "VITE_",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
