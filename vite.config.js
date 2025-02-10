import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()], // Soporte para HTTPS local

  build: {
    rollupOptions: {
      // ❌ Elimina esto porque necesitas "three" localmente
      // external: ['three']
    }
  },

  base: './', // 🔥 Mejor para Netlify y evitar problemas con rutas

  server: {
    host: true, // Permitir acceso desde la red local
    port: 5173  // (Opcional) Define un puerto específico
  }
});
