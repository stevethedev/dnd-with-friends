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
          "resize-handle": resolve(__dirname, "src/preload/resize-handle.ts"),
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
          "resize-handle": resolve(
            __dirname,
            "src/renderer/resize-handle.html",
          ),
        },
      },
    },
  },
});
