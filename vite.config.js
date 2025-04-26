import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  // Add base path for subfolder deployment
  base: './', 
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
    // Custom plugin to prevent config.json from being copied to dist
    {
      name: 'exclude-config-json',
      writeBundle: {
        sequential: true,
        order: 'post',
        handler({ dir }) {
          const configPath = path.join(dir, 'config.json');
          if (fs.existsSync(configPath)) {
            console.log('Removing config.json from build...');
            fs.unlinkSync(configPath);
          }
        }
      }
    }
  ],
});
