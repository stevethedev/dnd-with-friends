import { useState, useEffect, useRef } from "react";
import type { IpcResult } from "../../../shared/ipc/errors";

/** Subscribe to a push event, auto-unsub on unmount. Stable handler ref. */
export function useIpcEvent<T>(
  subscribe: (handler: (v: T) => void) => () => void,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  useEffect(() => {
    return subscribeRef.current((p) => {
      handlerRef.current(p);
    });
  }, []);
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
  const queryRef = useRef(query);
  queryRef.current = query;
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;

  useEffect(() => {
    queryRef.current()
      .then((r) => {
        if (r.ok) setValue(r.data);
      })
      .catch(console.error);
    return subscribeRef.current(setValue);
  }, []);

  return value;
}
