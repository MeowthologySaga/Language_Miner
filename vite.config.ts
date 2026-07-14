import { createRequire } from "node:module";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { configDefaults } from "vitest/config";

type ClientSecretGuard = {
  assertNoClientSecretEnv(environment: Record<string, string | undefined>): void;
};

const require = createRequire(import.meta.url);
const { assertNoClientSecretEnv } = require("./scripts/client-secret-guard.cjs") as ClientSecretGuard;

function getReleaseChunkName(moduleId: string) {
  const normalizedId = moduleId.replace(/\\/g, "/");
  if (normalizedId.endsWith("/src/i18n.ts")) {
    return "app-i18n";
  }
  if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(normalizedId)) {
    return "react-vendor";
  }
  if (/\/node_modules\/(?:i18next|react-i18next)\//.test(normalizedId)) {
    return "i18n-vendor";
  }
  return undefined;
}

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    assertNoClientSecretEnv({
      ...process.env,
      ...loadEnv(mode, process.cwd(), "VITE_")
    });
  }

  return {
    base: "./",
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
      proxy: {
        "/ollama": {
          target: "http://127.0.0.1:11434",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, "")
        }
      }
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: getReleaseChunkName
        }
      }
    },
    test: {
      exclude: [
        ...configDefaults.exclude,
        "artifacts/**",
        "cartridges/**",
        "debug/**",
        "dist/**",
        "dist-electron/**",
        "release/**"
      ]
    }
  };
});
