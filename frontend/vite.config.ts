import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(async () => {
  const tailwindcss = await import('tailwindcss');
  const autoprefixer = await import('autoprefixer');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    css: {
      postcss: {
        plugins: [
          tailwindcss.default,
          autoprefixer.default,
        ],
      },
    },
    server: {
      port: 5173,
      open: true,
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'es2020',
      },
    },
    build: {
      target: 'es2020',
    },
  };
});
