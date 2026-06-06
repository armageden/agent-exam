// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    },
    imageService: 'cloudflare',
    // Custom worker entry point to export the Durable Object (ChatAgent)
    workerEntryPoint: {
      path: 'src/worker.ts',
      namedExports: ['ChatAgent']
    }
  }),
  integrations: [react()]
});