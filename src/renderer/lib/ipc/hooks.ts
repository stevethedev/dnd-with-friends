import { useState, useEffect, useRef } from "react";
import type { IpcResult } from "../../../shared/ipc/errors";

/** Subscribe to a push event, auto-unsub on unmount. Stable handler ref. */
export function useIpcEvent<T>(
  subscribe: (handler: (v: T) => void) => () => void,
  handler: (payload: T) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () =>
      subscribe((p) => {
        ref.current(p);
      }),
    [subscribe],
  );
}

/**
 * Fetches initial value via IPC then stays live via push subscription.
 * Returns `undefined` until the first response arrives.
 */
export function useIpcState<T>(
  query: () => Promise<IpcResult<T>>,
  subscribe: (handler: (payload: T) => void) => () => void,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    query()
      .then((r) => {
        if (r.ok) setValue(r.data);
      })
      .catch(console.error);
    return subscribe(setValue);
  }, []);

  return value;
}
