import type { BrowserWindow } from "electron";
import type { ObserveChannel, PayloadOf } from "../../shared/ipc/types";

export function pushEvent<K extends ObserveChannel>(
  win: BrowserWindow | null,
  channel: K,
  payload: PayloadOf<K>,
): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
