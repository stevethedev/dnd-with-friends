import { useState, useEffect } from "react";
import type { Beyond20Status } from "../../../shared/types";

const INITIAL: Beyond20Status = { status: "idle", version: null };

export function useBeyond20(): Beyond20Status {
  const [status, setStatus] = useState<Beyond20Status>(INITIAL);

  useEffect(() => {
    // Fetch current status on mount
    window.electronAPI.getBeyond20Status().then(setStatus).catch(console.error);

    // Subscribe to subsequent updates from main process
    const unsub = window.electronAPI.onBeyond20Update(setStatus);
    return unsub;
  }, []);

  return status;
}
