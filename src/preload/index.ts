import { contextBridge, ipcRenderer } from "electron";
import type { ElectronBridge } from "../shared/ipc/bridge-types";
import { INVOKE_CHANNELS, OBSERVE_CHANNELS } from "../shared/ipc/api";

const bridge: ElectronBridge = {
  invoke(channel, input) {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.resolve({
        ok: false,
        error: {
          code: "UNKNOWN_CHANNEL",
          channel,
          message: `Unknown channel: ${channel}`,
        },
      });
    }
    return ipcRenderer.invoke(channel, input);
  },

  on(channel, handler) {
    if (!OBSERVE_CHANNELS.has(channel)) return () => {};
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: unknown,
    ): void => {
      handler(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld("__bridge", bridge);
