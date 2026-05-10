import type { ElectronBridge } from "../../../shared/ipc/bridge-types";

declare global {
  interface Window {
    __bridge: ElectronBridge;
    __platform: string;
  }
}

export {};
