import type { ZodError } from "zod";

export interface SerializedError {
  code: string;
  channel: string;
  message: string;
  details?: unknown;
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SerializedError };

export class IpcError {
  static fromZod(channel: string, err: ZodError): SerializedError {
    return {
      code: "VALIDATION_ERROR",
      channel,
      message: err.message,
      details: err.issues,
    };
  }

  static serialize(err: unknown, channel: string): SerializedError {
    return {
      code: "HANDLER_ERROR",
      channel,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  static unknown(channel: string): SerializedError {
    return {
      code: "UNKNOWN_CHANNEL",
      channel,
      message: `Unknown channel: ${channel}`,
    };
  }
}
