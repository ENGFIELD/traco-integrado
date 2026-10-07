import { defineConfig } from "vite";

// Build estático para o Firebase Hosting (firebase.json → "public": "dist").
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019", // iPhones antigos (iOS 13+) e Android com Chrome desatualizado
    sourcemap: true,
    chunkSizeWarningLimit: 1500
  },
  server: { port: 5173 }
});
