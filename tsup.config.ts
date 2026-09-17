import { defineConfig } from "tsup";

// Single config for both entries — parallel configs with `clean: true` race
// on dist/ and fail with ENOENT during DTS generation.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react/index.ts",
  },
  format: ["esm", "cjs"],
  clean: true,
  sourcemap: true,
  target: "es2020",
  external: ["react", "react-dom", "react/jsx-runtime", "jszip"],
  dts: true,
  treeshake: true,
});
