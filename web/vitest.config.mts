import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` lança fora de um Server Component; nos testes é um no-op.
  "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
};

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          // Precisam de DATABASE_URL — rode via `npm test` (sobe um Postgres descartável).
          name: "db",
          include: ["src/**/*.db-test.ts"],
          environment: "node",
          fileParallelism: false,
          setupFiles: ["test/db-setup.ts"],
        },
      },
    ],
  },
});
