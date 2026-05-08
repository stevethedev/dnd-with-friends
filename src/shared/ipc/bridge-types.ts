import type { IpcResult } from "./errors";

export interface ElectronBridge {
  invoke(channel: string, input?: unknown): Promise<IpcResult<unknown>>;
  on(channel: string, handler: (payload: unknown) => void): () => void;
}
