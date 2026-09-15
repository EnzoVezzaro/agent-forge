import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: the app is served from /proagents/app/.
export default defineConfig({
  base: "/proagents/app/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
