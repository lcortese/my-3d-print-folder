// This file is an augmentation to the built-in ImportMeta interface
// Thus cannot contain any top-level imports.

interface ImportMetaEnv {
  /**
   * Absolute origin of the API (`http://host:port`). `vite.config.ts` always
   * injects it, both for the dev server and for the build, from API_HOST and
   * API_PORT, because the web app calls the API directly instead of going
   * through a dev proxy.
   */
  readonly VITE_API_URL: string
}
