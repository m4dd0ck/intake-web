/// <reference types="vite/client" />

/** A file's bytes as base64, from the `?base64` import plugin in vite.config.ts. */
declare module "*?base64" {
  const data: string;
  export default data;
}
