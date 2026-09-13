import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared/index": path.resolve(__dirname, "../shared/src/index.ts"),
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
