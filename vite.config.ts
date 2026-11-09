import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'local-dev-csp',
      transformIndexHtml(html) {
        return command === 'serve'
          ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
          : html;
      },
    },
  ],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2022' },
}));
