import { readFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The page's only privacy guarantee that does not depend on our own code: the browser refuses
 * any connection to another origin. GitHub Pages cannot send headers, so it is a meta tag, and
 * only in the build (the dev server needs inline scripts for hot reload).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

/** `import data from "./file.xlsx?base64"`: a file's bytes as a base64 string in the bundle. */
function base64Import(): Plugin {
  const suffix = "?base64";
  return {
    name: "base64-import",
    enforce: "pre",
    async load(id) {
      if (!id.endsWith(suffix)) return null;
      const bytes = await readFile(id.slice(0, -suffix.length));
      return `export default ${JSON.stringify(bytes.toString("base64"))};`;
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [base64Import(), contentSecurityPolicy()],
  worker: { format: "es", plugins: () => [base64Import()] },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
