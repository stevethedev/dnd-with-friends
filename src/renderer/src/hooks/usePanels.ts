import { useCallback } from "react";
import { ipc } from "../../lib/ipc/client";
import { useIpcState } from "../../lib/ipc/hooks";
import type { PanelInfo } from "../../../shared/types";
import { normalizeUrl } from "../../../shared/utils";

interface PanelControl {
  panels: PanelInfo[];
  toggle: (panelId: string) => void;
  createPanel: (url: string) => void;
  removePanel: (panelId: string) => void;
  navigatePanel: (panelId: string, url: string) => void;
}

export function usePanels(): PanelControl {
  const panels =
    useIpcState(ipc.panels.list, ipc.panels.onListUpdated) ??
    ([] as PanelInfo[]);

  const toggle = useCallback((id: string): void => {
    void ipc.panels.toggle({ id });
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

  return { panels, toggle, createPanel, removePanel, navigatePanel };
}
