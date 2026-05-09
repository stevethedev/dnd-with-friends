import { app, BrowserWindow, session } from "electron";
import {
  ensureLatestBeyond20,
  setBeyond20StatusListener,
} from "./beyond20Manager";
import { createWindowWithPanels, getMainWindow } from "./windowManager";
import { registerIpcHandlers, pushEvent } from "./ipc";

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  try {
    const win = getMainWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  } catch {
    // Window may not exist yet
  }
});

async function loadBeyond20Extension(extensionDir: string): Promise<boolean> {
  try {
    await session.defaultSession.extensions.loadExtension(extensionDir, {
      allowFileAccess: false,
    });
    console.log("[Beyond20] Extension loaded successfully");
    return true;
  } catch (err) {
    console.error("[Beyond20] Failed to load extension:", err);
    return false;
  }
}

void app.whenReady().then(async () => {
  // Deny all permission requests (camera, microphone, notifications, etc.).
  // This app loads external web content in panels; those pages must not gain
  // access to system resources without explicit user consent at the OS level.
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      console.warn("[Security] Permission request denied:", permission);
      callback(false);
    },
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Step 1: Download / verify Beyond20
  const extensionDir = await ensureLatestBeyond20();

  // Step 2: Load extension into session BEFORE creating any WebContentsViews
  if (extensionDir) {
    const loaded = await loadBeyond20Extension(extensionDir);
    if (!loaded) {
      console.error(
        "[Beyond20] Extension unavailable — dice integration disabled",
      );
    }
  }

  // Step 3: Register IPC handlers
  registerIpcHandlers();

  // Step 4: Create the window and panels
  createWindowWithPanels();

  // Step 5: Forward Beyond20 status updates to the renderer
  setBeyond20StatusListener((status) => {
    try {
      pushEvent(getMainWindow(), "beyond20.statusUpdated", status);
    } catch {
      // Window may not exist yet during startup
    }
  });

  // On macOS re-activate, reopen window if none exist
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowWithPanels();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
