import { useCallback, useMemo } from "react";
import { ipc } from "../../lib/ipc/client";
import { useIpcState } from "../../lib/ipc/hooks";
import type { PanelInfo } from "../../../shared/types";
import { normalizeUrl } from "../../../shared/utils";

interface PanelControl {
  panels: PanelInfo[];
  focusedPanel: PanelInfo | null;
  minimizePanel: (panelId: string) => void;
  restorePanel: (panelId: string) => void;
  focusPanel: (panelId: string) => void;
  createPanel: (url: string) => void;
  removePanel: (panelId: string) => void;
  navigatePanel: (panelId: string, url: string) => void;
}

export function usePanels(): PanelControl {
  const panels =
    useIpcState(ipc.panels.list, ipc.panels.onListUpdated) ??
    ([] as PanelInfo[]);

  // useMemo keeps the reference stable when panels hasn't changed, preventing
  // downstream consumers from re-rendering due to a new object identity.
  const focusedPanel = useMemo(
    () =>
      panels
        .filter((p) => p.state === "open")
        .sort((a, b) => b.zIndex - a.zIndex)[0] ?? null,
    [panels],
  );

  const minimizePanel = useCallback((id: string): void => {
    void ipc.panels.minimize({ id });
  }, []);

  const restorePanel = useCallback((id: string): void => {
    void ipc.panels.restore({ id });
  }, []);

  const focusPanel = useCallback((id: string): void => {
    void ipc.panels.focus({ id });
  }, []);

  const createPanel = useCallback((url: string): void => {
    void ipc.panels.create({ url });
  }, []);

  const removePanel = useCallback((id: string): void => {
    void ipc.panels.remove({ id });
  }, []);

  const navigatePanel = useCallback((id: string, url: string): void => {
    void ipc.panels.navigate({ id, url: normalizeUrl(url) });
  }, []);

  return {
    panels,
    focusedPanel,
    minimizePanel,
    restorePanel,
    focusPanel,
    createPanel,
    removePanel,
    navigatePanel,
  };
}
