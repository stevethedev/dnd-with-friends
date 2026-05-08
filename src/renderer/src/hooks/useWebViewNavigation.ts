import { useCallback } from "react";
import { ipc } from "../../lib/ipc/client";
import { useIpcState } from "../../lib/ipc/hooks";
import { normalizeUrl } from "../../../shared/utils";

interface PanelNavigation {
  currentUrl: string;
  navigate: (url: string) => void;
}

export function useRoll20Navigation(): PanelNavigation {
  const currentUrl =
    useIpcState(ipc.roll20.getUrl, ipc.roll20.onUrlChanged) ?? "";

  const navigate = useCallback((url: string): void => {
    if (!url.trim()) return;
    void ipc.roll20.navigate({ url: normalizeUrl(url) });
  }, []);

  return { currentUrl, navigate };
}
