import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@remotion-project": path.resolve(__dirname, "./remotion"),
    },
  },
  test: {
    environment: "node",
    include: ["remotion/**/*.test.ts", "src/**/*.test.ts"],
  },
});
