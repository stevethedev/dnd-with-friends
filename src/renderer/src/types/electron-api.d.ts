import type { ElectronBridge } from "../../../shared/ipc/bridge-types";

interface ResizeAPI {
  onInit: (cb: (panelId: string, currentWidth: number) => void) => () => void;
  startDrag: () => void;
  resize: (panelId: string, newWidth: number) => void;
  endDrag: (panelId: string, finalWidth: number) => void;
}

declare global {
  interface Window {
    __bridge: ElectronBridge;
    resizeAPI: ResizeAPI;
    __platform: string;
  }
}

export {};
