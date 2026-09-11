import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /*
    PDFKit's browser build still reaches for Node's `global`. Without this the
    receipt generator throws "global is not defined" the first time it runs.
  */
  define: { global: "globalThis" },
  server: { port: 5173 },
});
