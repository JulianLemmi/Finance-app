import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/functions']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Antes este config sólo miraba .js/.jsx, y la app es casi toda .ts/.tsx: `npm run lint`
  // pasaba limpio porque no estaba revisando prácticamente nada. Las reglas de hooks son
  // las que más importan acá (dependencias de efectos, hooks condicionales).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Regla pensada para el compilador de React (que esta app no usa). Los efectos que
      // quedan marcados son de dos tipos legítimos: "reiniciar el formulario cuando el
      // sheet se abre" (ocho sheets) y animar un número con requestAnimationFrame. Los casos
      // que SÍ eran un problema —estado que se podía derivar, o un valor que tenía que
      // armarse en el click— se arreglaron a mano (ProfileScreen, FinanceApp).
      'react-hooks/set-state-in-effect': 'off',
      // Desestructurar para OMITIR una clave (`const { vehicleOn, ...resto } = form`) es el
      // idioma estándar para sacar un campo de un objeto, y la variable omitida nunca se
      // lee. `_` al principio marca lo intencional.
      '@typescript-eslint/no-unused-vars': ['error', {
        ignoreRestSiblings: true,
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
])
