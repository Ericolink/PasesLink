import { defineConfig } from 'vitest/config'

// Corre contra el emulador real de Firestore (FIRESTORE_EMULATOR_HOST), no
// contra producción — mismo principio que vitest.firebase.config.ts en la
// raíz. Se invoca envuelto en `firebase emulators:exec` (ver
// package.json:test:functions en la raíz), que setea esa env var.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Todos los archivos de test comparten el mismo proyecto del emulador de
    // Firestore (a diferencia de src/firebase/__tests__/helpers.ts, que le
    // da a cada test file un projectId único vía @firebase/rules-unit-testing
    // — acá no hace falta esa librería porque el Admin SDK ignora las rules,
    // pero eso significa que no hay aislamiento automático entre archivos).
    // Sin esto, clearFirestoreEmulator() de un archivo borra datos que otro
    // archivo está usando a mitad de un test — Vitest corre archivos en
    // paralelo por default.
    fileParallelism: false,
  },
})
