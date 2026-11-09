import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // The boot-script tests run real child processes (and, on Node 20, go
    // through the Prisma engine), so give them more than the 5 s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/**/*.ts"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
