// @ts-check
import { defineConfig, envField } from "astro/config";
import process from "node:process";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@supabase/ssr"],
    },
  },
  adapter: cloudflare({
    // Workers AI needs a remote binding in `astro dev`. `astro build` (CI included)
    // must emulate bindings locally — otherwise wrangler starts a remote proxy and
    // fails without Cloudflare login.
    remoteBindings: process.argv.includes("dev"),
  }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
