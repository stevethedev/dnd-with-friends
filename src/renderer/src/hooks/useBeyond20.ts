import { ipc } from "../../lib/ipc/client";
import { useIpcState } from "../../lib/ipc/hooks";
import type { Beyond20Status } from "../../../shared/types";

const INITIAL: Beyond20Status = { status: "idle", version: null };

export function useBeyond20(): Beyond20Status {
  return (
    useIpcState(ipc.beyond20.getStatus, ipc.beyond20.onStatusUpdated) ?? INITIAL
  );
}
