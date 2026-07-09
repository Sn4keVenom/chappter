import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `npm run build` emits compiled test files into dist/tests/ too (tsc's
    // outDir, per tsconfig's include: ["**/*.ts"]) — without this exclude,
    // running `build` before `test` makes vitest discover the same suite
    // twice: once as real TS source, once as compiled CommonJS output that
    // fails to load under vitest's ESM runtime.
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./tests/setup.ts"],
    // All test files share one real Postgres database (see tests/setup.ts
    // resetDb()) — running files in parallel would let one file's truncate
    // race another file's inserts. Sequential is slower but correct; this
    // suite is small enough that it doesn't matter.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
