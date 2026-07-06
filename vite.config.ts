/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" maakt de build pad-onafhankelijk, zodat dezelfde bundel
// zowel lokaal als op GitHub Pages (onder /reisplanner/) werkt.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "node",
    // Alleen unit tests; e2e/*.spec.ts is voor Playwright.
    include: ["src/**/*.test.ts"],
  },
});
