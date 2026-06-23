import { defineConfig } from 'vitest/config'

// Config separada para los tests que necesitan el emulador de Firestore corriendo
// (src/firebase/__tests__). Se invoca vía `npm run test:firebase`, que primero
// levanta el emulador con `firebase emulators:exec`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/firebase/__tests__/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
