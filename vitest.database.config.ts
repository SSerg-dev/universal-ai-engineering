import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/database/**/*.db.test.ts"], watch: false,
    fileParallelism: false, maxWorkers: 1, testTimeout: 10_000, hookTimeout: 20_000,
  },
});
