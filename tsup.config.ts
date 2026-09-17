import { defineConfig } from "tsup";

const shared = {
  clean: true,
  sourcemap: true,
  target: "es2020",
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "jszip",
  ],
  dts: true,
  treeshake: true,
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
  },
  {
    ...shared,
    entry: { react: "src/react/index.ts" },
    format: ["esm", "cjs"],
  },
]);
