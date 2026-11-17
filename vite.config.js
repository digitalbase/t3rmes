import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // Relative asset URLs so the packaged app can load dist/index.html over file://.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '~': path.resolve(process.cwd(), 'src/t3') } },
});
