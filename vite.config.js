import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()], // Soporte para HTTPS local

  optimizeDeps: {
    include: ['three'], // ✅ Asegura que Three.js se procese en desarrollo
  },

  build: {
    rollupOptions: {
      external: [], // ✅ No excluyas "three" para que esté en el bundle
    }
  },

  base: './', // ✅ Útil para Netlify y entornos con rutas relativas

  server: {
    host: true, // Permitir acceso desde la red local
    port: 5173  // (Opcional) Define un puerto específico
  }
});
