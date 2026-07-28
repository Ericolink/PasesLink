import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Deuda pre-existente detectada al activar jsx-a11y/recommended por
      // primera vez (ver ACCESSIBILITY_AUDIT.md / plan de accessibility/):
      // se baja a 'warn' para no romper `npm run lint` en CI mientras se
      // cierra caso por caso (label-has-associated-control se resuelve al
      // migrar los formularios a AccessibleField). click-events-have-key-events
      // / no-static-element-interactions / no-noninteractive-element-interactions
      // disparan sobre todo en backdrops de modal (<div onClick={onClose}>)
      // que son un affordance de mouse deliberadamente secundario a Escape
      // (manejado a nivel de documento por useAccessibleModal) — agregar un
      // tabIndex/keydown falso a un overlay de pantalla completa sería peor
      // (rompe el orden de tab), así que quedan documentados caso por caso
      // en vez de silenciados en bloque para siempre.
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
    },
  },
])
