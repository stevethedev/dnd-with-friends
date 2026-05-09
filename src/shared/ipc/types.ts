import type { z } from "zod";
import type { API } from "./api";
import type { IpcResult } from "./errors";

type InvokeChannels = typeof API.invoke;
type ObserveChannels = typeof API.observe;

export type InvokeChannel = keyof InvokeChannels;
export type ObserveChannel = keyof ObserveChannels;

export type InputOf<K extends InvokeChannel> = z.infer<
  InvokeChannels[K]["input"]
>;
export type OutputOf<K extends InvokeChannel> = z.infer<
  InvokeChannels[K]["output"]
>;
export type PayloadOf<K extends ObserveChannel> = z.infer<ObserveChannels[K]>;

export type InvokeMethod<K extends InvokeChannel> = (
  input: InputOf<K>,
) => Promise<IpcResult<OutputOf<K>>>;

export type ObserveMethod<K extends ObserveChannel> = (
  handler: (payload: PayloadOf<K>) => void,
) => () => void;

export type HandlerFn<K extends InvokeChannel> = (
  input: InputOf<K>,
) => OutputOf<K> | Promise<OutputOf<K>>;

/** Exhaustive map — TypeScript errors if any declared channel is missing. */
export type HandlerMap = { [K in InvokeChannel]: HandlerFn<K> };
