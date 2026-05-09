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

export class IpcError implements SerializedError {
  static fromZod(channel: string, err: ZodError): IpcError {
    return new IpcError({
      code: "VALIDATION_ERROR",
      channel,
      message: err.message,
      details: err.issues,
    });
  }

  readonly code: string;
  readonly channel: string;
  readonly message: string;
  readonly details?: unknown;

  constructor(error: SerializedError) {
    this.code = error.code;
    this.channel = error.channel;
    this.message = error.message;
    this.details = error.details;
  }
}
