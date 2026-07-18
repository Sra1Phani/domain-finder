import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // --- Clearance-core boundary --------------------------------------------
  // packages/core must stay liftable: no framework, no DB driver, no runtime
  // env. This makes the boundary a lint failure, not a convention. Network I/O
  // (RDAP/IANA/AI) is allowed ONLY through injected dependencies — never by the
  // core importing a client or reaching for a global here.
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "next", message: "core must not depend on Next." },
            { name: "react", message: "core must not depend on React." },
            { name: "react-dom", message: "core must not depend on React DOM." },
            { name: "drizzle-orm", message: "core must not touch the database." },
            { name: "postgres", message: "core must not touch the database." },
          ],
          patterns: [
            {
              group: [
                "next/*",
                "react/*",
                "react-dom/*",
                "drizzle-orm/*",
                "postgres/*",
                "@/*",
              ],
              message:
                "core must not import app/framework/DB modules — inject dependencies instead.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            "core must not read process.env — pass config in via createCore(deps).",
        },
      ],
    },
  },
]);

export default eslintConfig;
