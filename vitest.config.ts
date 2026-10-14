import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    coverage: {
      include: ["src/**/domain/**", "src/**/application/**"],
      exclude: ["**/*.spec.ts", "**/testing/**"],
    },
  },
});
