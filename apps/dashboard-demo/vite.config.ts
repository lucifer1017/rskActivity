import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
