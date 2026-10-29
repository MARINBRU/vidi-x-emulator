import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { attachLocalShareWebSocket } from './localshare/server.mjs';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'localshare-dev-plugin',
      configureServer(server) {
        if (server.httpServer) {
          attachLocalShareWebSocket(server.httpServer);
        }
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0];
          if (url === '/localshare' || url === '/localshare/' || url === '/localshare/index.html') {
            const htmlPath = path.resolve(process.cwd(), 'localshare/index.html');
            if (fs.existsSync(htmlPath)) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(fs.readFileSync(htmlPath, 'utf8'));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
