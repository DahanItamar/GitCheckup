import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // lib/config.ts throws at import when the env is invalid, by design.
    // Tests get placeholder values; nothing here reaches the network.
    env: {
      GITHUB_TOKEN: "test-token-not-used",
      RATE_LIMIT_SECRET: "test-secret-not-used",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
