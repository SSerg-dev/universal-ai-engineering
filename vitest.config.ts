import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/database/**", "node_modules/**", "dist/**"],
    watch: false,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
});
