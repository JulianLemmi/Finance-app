// Config de tests, separada de vite.config.ts para no cargar el plugin de PWA en cada
// corrida. `environment: jsdom` es necesario porque parte de la suite renderiza hooks
// (useDerived) con @testing-library/react.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // La app corre en Argentina y varias fórmulas dependen de "hoy"; fijar la zona evita
    // que los tests pasen o fallen según la máquina donde corran.
    env: { TZ: "America/Argentina/Buenos_Aires" },
    coverage: {
      provider: "v8",
      include: ["src/lib/calcs.ts", "src/lib/utils.ts", "src/store/index.ts"],
      reporter: ["text", "html"],
    },
  },
});
