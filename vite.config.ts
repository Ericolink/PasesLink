import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Los tests de src/firebase/__tests__ necesitan el emulador de Firestore corriendo;
    // se ejecutan aparte con `npm run test:firebase` (ver vitest.firebase.config.ts).
    exclude: [...configDefaults.exclude, 'src/firebase/__tests__/**'],
  },
})
