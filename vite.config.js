import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "/yetAnotherProductivityApp/",
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        dashboard: fileURLToPath(new URL("./dashboard.html", import.meta.url)),
      },
    },
  },
});