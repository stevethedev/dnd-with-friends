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

export function fromZodError(
  channel: string,
  err: ZodError,
  includeDetails: boolean = true,
): SerializedError {
  return {
    code: "VALIDATION_ERROR",
    channel,
    message: err.message,
    ...(includeDetails && { details: err.issues }),
  };
}
