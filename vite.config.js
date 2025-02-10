import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],

  build: {
    rollupOptions: {
      external: ['three'] // Indica a Rollup que no incluya 'three' en el bundle final
    }
  },

  base: '/',

  server: {
    host: true // Permite acceder desde la red local (npx vite --host)
  }
});
