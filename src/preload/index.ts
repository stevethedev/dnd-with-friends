import { contextBridge, ipcRenderer } from "electron";
import type { ElectronBridge } from "../shared/ipc/bridge-types";
import { INVOKE_CHANNELS, OBSERVE_CHANNELS } from "../shared/ipc/api";
import type { IpcResult } from "../shared/ipc/errors";

const bridge: ElectronBridge = {
  invoke(channel: string, input: unknown): Promise<IpcResult<unknown>> {
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

  on(channel: string, handler: (payload: unknown) => void): () => void {
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
contextBridge.exposeInMainWorld("__platform", process.platform);
