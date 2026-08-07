import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `.tsx` under components/ so presentational logic that is worth testing —
    // the sparkline's scaling, so far — can be, by rendering to static markup.
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
    // lib/config.ts throws at import when the env is invalid, by design.
    // Tests get placeholder values; nothing here reaches the network.
    env: {
      GITHUB_TOKEN: "test-token-not-used",
      RATE_LIMIT_SECRET: "test-secret-not-used",
      DATABASE_URL: "postgresql://test@localhost:5432/not-connected",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
