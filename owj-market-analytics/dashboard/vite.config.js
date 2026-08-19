import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../public", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/dashboard": "http://127.0.0.1:4567",
      "/events": "http://127.0.0.1:4567",
      "/listings": "http://127.0.0.1:4567",
      "/scores": "http://127.0.0.1:4567",
      "/score-details": "http://127.0.0.1:4567",
      "/score-analytics-data": "http://127.0.0.1:4567",
      "/scoring-report": "http://127.0.0.1:4567",
    },
  },
});
