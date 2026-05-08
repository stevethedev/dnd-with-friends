import { useState, useEffect, useCallback } from "react";
import { normalizeUrl } from "../../../shared/utils";

interface PanelNavigation {
  currentUrl: string;
  navigate: (url: string) => void;
}

export function useRoll20Navigation(): PanelNavigation {
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    window.electronAPI
      .getRoll20Url()
      .then((url) => {
        if (url) setCurrentUrl(url);
      })
      .catch(console.error);
    return window.electronAPI.onRoll20UrlChanged((url) => {
      setCurrentUrl(url);
    });
  }, []);

  const navigate = useCallback((url: string): void => {
    if (!url.trim()) return;
    window.electronAPI.navigateRoll20(normalizeUrl(url)).catch(console.error);
  }, []);

  return { currentUrl, navigate };
}
