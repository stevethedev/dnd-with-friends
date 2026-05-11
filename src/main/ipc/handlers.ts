import type { Beyond20Status, PanelInfo } from "../../shared/types";
import {
  getRoll20View,
  getPanelInfoList,
  createPanel,
  removePanel,
  minimizePanel,
  restorePanel,
  focusPanel,
  movePanelView,
  resizePanelView,
  navigatePanel,
  getPanelUrl,
  getMainWindow,
  getOverlayWindow,
} from "../windowManager";
import { getBeyond20Status } from "../beyond20Manager";
import type { HandlerMap } from "../../shared/ipc/types";

export function createHandlers(): HandlerMap {
  return {
    "panel.list": (): PanelInfo[] => getPanelInfoList(),
    "panel.create": ({ url }: { url: string }): PanelInfo => createPanel(url),
    "panel.remove": ({ id }: { id: string }): PanelInfo[] => {
      removePanel(id);
      return getPanelInfoList();
    },
    "panel.minimize": ({ id }: { id: string }): PanelInfo[] =>
      minimizePanel(id),
    "panel.restore": ({ id }: { id: string }): PanelInfo[] => restorePanel(id),
    "panel.focus": ({ id }: { id: string }): PanelInfo[] => focusPanel(id),
    "panel.move": ({
      id,
      x,
      y,
    }: {
      id: string;
      x: number;
      y: number;
    }): void => {
      movePanelView(id, x, y);
    },
    "panel.resize": ({
      id,
      width,
      height,
      final,
    }: {
      id: string;
      width: number;
      height: number;
      final?: boolean;
    }): void => {
      resizePanelView(id, width, height, final ?? false);
    },
    "panel.navigate": ({ id, url }: { id: string; url: string }): void => {
      navigatePanel(id, url);
    },
    "panel.getUrl": ({ id }: { id: string }): string => getPanelUrl(id),
    "roll20.navigate": ({ url }: { url: string }): void => {
      void getRoll20View().webContents.loadURL(url);
    },
    "roll20.getUrl": (): string => getRoll20View().webContents.getURL(),
    "beyond20.getStatus": (): Beyond20Status => getBeyond20Status(),
    "window.minimize": (): void => {
      getMainWindow().minimize();
    },
    "window.maximize": (): void => {
      const w = getMainWindow();
      if (w.isMaximized()) {
        w.unmaximize();
      } else {
        w.maximize();
      }
    },
    "window.close": (): void => {
      getMainWindow().close();
    },
    "window.isMaximized": (): boolean => getMainWindow().isMaximized(),
    "overlay.setIgnoreMouseEvents": ({ ignore }: { ignore: boolean }): void => {
      const overlay = getOverlayWindow();
      if (overlay && !overlay.isDestroyed()) {
        overlay.setIgnoreMouseEvents(ignore, { forward: true });
      }
    },
  };
}
