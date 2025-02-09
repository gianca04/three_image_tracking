import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true, // Permite que el servidor sea accesible en la red npx vite --host
  }
})
