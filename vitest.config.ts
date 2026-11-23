import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // 5s (padrão) é apertado para testes de autopilot que tocam IA/coletores: sob
    // carga da suíte inteira dois deles estouravam por tempo, não por defeito.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});