import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    watch: false,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
  },
});
