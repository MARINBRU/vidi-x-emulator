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
      name: 'sharing-dev-plugin',
      configureServer(server) {
        if (server.httpServer) {
          attachLocalShareWebSocket(server.httpServer);
        }
        server.middlewares.use((req, res, next) => {
          const requestUrl = new URL(req.url || '/', 'http://localhost');
          if (requestUrl.pathname === '/textshare') {
            res.statusCode = 301;
            res.setHeader('Location', '/textshare/' + requestUrl.search);
            res.end();
            return;
          }
          const files: Record<string, [string, string]> = {
            '/localshare': ['localshare/index.html', 'text/html; charset=utf-8'],
            '/localshare/': ['localshare/index.html', 'text/html; charset=utf-8'],
            '/localshare/index.html': ['localshare/index.html', 'text/html; charset=utf-8'],
            '/textshare/': ['textshare/index.html', 'text/html; charset=utf-8'],
            '/textshare/index.html': ['textshare/index.html', 'text/html; charset=utf-8'],
            '/textshare/style.css': ['textshare/style.css', 'text/css; charset=utf-8'],
            '/textshare/app.js': ['textshare/app.js', 'application/javascript; charset=utf-8'],
          };
          const file = files[requestUrl.pathname];
          if (file) {
            const filePath = path.resolve(process.cwd(), file[0]);
            if (fs.existsSync(filePath)) {
              res.statusCode = 200;
              res.setHeader('Content-Type', file[1]);
              res.setHeader('Cache-Control', 'no-store');
              res.end(fs.readFileSync(filePath, 'utf8'));
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
