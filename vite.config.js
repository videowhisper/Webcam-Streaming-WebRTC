import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';

// Get current date and time for build timestamp
const now = new Date();
const buildTimestamp = now.toISOString();
const buildDate = now.toLocaleDateString();
const buildTime = now.toLocaleTimeString();

export default defineConfig({
  // Add base path for subfolder deployment
  base: './', 
  publicDir: false,
  define: {
    // Make build information available to the app
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    // only rewrite URLs **without** a file extension
    historyApiFallback: {
      disableDotRule: false   // ← leave this false so files with extensions are not rewritten
    }
  },
  preview: {
    historyApiFallback: {
      disableDotRule: false
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico'],
      workbox: { globIgnores: ['**/config.json', '**/login.json'], navigateFallbackDenylist: [/\/(?:config|auth)\.php/] },
      manifest: {
        name: 'Webcam Streaming WebRTC',
        short_name: 'Cam Stream',
        // Update start_url to use relative path
        start_url: './',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
    // Publish only known public templates/assets. Local service configuration
    // must never enter a distribution or its service-worker precache.
    {
      name: 'public-file-allowlist',
      generateBundle() {
        for (const fileName of ['unconfigured.json', 'vite.svg', 'watermark.png']) {
          this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(path.resolve('public', fileName)) });
        }
      },
    }
  ],
});
