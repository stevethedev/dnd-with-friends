import type { ElectronBridge } from "../../../shared/ipc/bridge-types";
import type {
  InvokeChannel,
  ObserveChannel,
  InvokeMethod,
  ObserveMethod,
} from "../../../shared/ipc/types";

function getBridge(): ElectronBridge {
  return window.__bridge;
}

function cmd<K extends InvokeChannel>(channel: K): InvokeMethod<K> {
  return ((input?: unknown) =>
    getBridge().invoke(channel, input)) as InvokeMethod<K>;
}

function evt<K extends ObserveChannel>(channel: K): ObserveMethod<K> {
  return (handler) => getBridge().on(channel, handler as (p: unknown) => void);
}

export const ipc = {
  panels: {
    list: cmd("panel.list"),
    create: cmd("panel.create"),
    remove: cmd("panel.remove"),
    toggle: cmd("panel.toggle"),
    navigate: cmd("panel.navigate"),
    getUrl: cmd("panel.getUrl"),
    onListUpdated: evt("panel.listUpdated"),
    onUrlChanged: evt("panel.urlChanged"),
  },
  roll20: {
    navigate: cmd("roll20.navigate"),
    getUrl: cmd("roll20.getUrl"),
    onUrlChanged: evt("roll20.urlChanged"),
  },
  beyond20: {
    getStatus: cmd("beyond20.getStatus"),
    onStatusUpdated: evt("beyond20.statusUpdated"),
  },
  window: {
    minimize: cmd("window.minimize"),
    maximize: cmd("window.maximize"),
    close: cmd("window.close"),
    isMaximized: cmd("window.isMaximized"),
    onMaximizeChanged: evt("window.maximizeChanged"),
  },
} as const;
