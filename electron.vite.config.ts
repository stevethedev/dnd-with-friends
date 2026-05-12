import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          format: "es",
        },
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    // zod must be bundled (not externalized) because sandbox:true preloads
    // cannot require() npm packages at runtime — only Electron built-ins are available.
    build: {
      externalizeDeps: {
        exclude: ["zod"],
      },
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          roll20: resolve(__dirname, "src/preload/roll20.ts"),
          "roll20-popout": resolve(__dirname, "src/preload/roll20-popout.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          overlay: resolve(__dirname, "src/renderer/overlay.html"),
        },
      },
    },
  },
});
