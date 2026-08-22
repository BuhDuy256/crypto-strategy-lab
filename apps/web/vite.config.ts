import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Development proxy target: the backend API/WebSocket process
// (apps/backend/src/main.api.ts), which defaults to port 3000.
const BACKEND_DEV_URL = process.env.BACKEND_DEV_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The SPA only ever calls the project backend through this
      // prefix (see src/api/client.ts). Never proxy or call a
      // third-party market/news API directly from here.
      "/api": {
        target: BACKEND_DEV_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
