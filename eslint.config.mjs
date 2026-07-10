import tsParser from "@typescript-eslint/parser"

export default [
  {
    ignores: [
      ".next/**",
      "android/**",
      "dist/**",
      "node_modules/**",
      "out/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
]
