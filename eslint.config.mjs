import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Rules below encode SPEC.md §4 so they are never a review opinion:
 * the size limits, and the dependency direction between lib/ modules.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "drizzle/**",
    "next-env.d.ts",
  ]),

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // A leading underscore marks a parameter kept for an interface's shape
      // rather than used — e.g. options a later milestone will read.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 80, skipBlankLines: true, skipComments: true },
      ],
      "max-depth": ["error", 4],
      "max-params": ["error", 4],
    },
  },

  // React component bodies are reviewed for length, not linted (§4).
  {
    files: ["**/*.tsx"],
    rules: { "max-lines-per-function": "off" },
  },

  // lib/score/ is pure: it imports nothing but its own types, and type-only
  // references to the signal shape it is handed.
  {
    files: ["lib/score/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/github/*"],
              allowTypeImports: true,
              message: "lib/score/ may only type-import from lib/github/.",
            },
            {
              group: [
                "@/lib/db*",
                "@/lib/services*",
                "@/lib/tips*",
                "@/lib/config*",
                "@/components*",
                "@/app*",
                "react",
                "react-dom",
                "next",
                "next/*",
                "zod",
                "drizzle-orm*",
              ],
              message: "lib/score/ is the pure rubric. It imports nothing.",
            },
          ],
        },
      ],
    },
  },

  // lib/github/ and lib/db/ never meet. lib/services/ is the only place they do.
  {
    files: ["lib/github/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/db*",
                "@/lib/services*",
                "@/components*",
                "@/app*",
              ],
              message:
                "lib/github/ talks to GitHub. Orchestration lives in lib/services/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/db/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/github*",
                "@/lib/services*",
                "@/components*",
                "@/app*",
              ],
              message:
                "lib/db/ emits SQL. Orchestration lives in lib/services/.",
            },
          ],
        },
      ],
    },
  },

  // components/ are presentational. They take props.
  {
    files: ["components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/db*",
                "@/lib/github/client*",
                "@/lib/github/signals*",
                "@/lib/services*",
              ],
              message: "components/ never fetch. They take props.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
