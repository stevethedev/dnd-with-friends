import { ipcMain, app } from "electron";
import { API } from "../../shared/ipc/api";
import { IpcError } from "../../shared/ipc/errors";
import type { HandlerMap, InvokeChannel } from "../../shared/ipc/types";

export function registerHandlers(handlers: HandlerMap): void {
  for (const channel of Object.keys(API.invoke) as InvokeChannel[]) {
    const contract = API.invoke[channel];
    const handler = handlers[channel] as (input: unknown) => Promise<unknown>;

    ipcMain.handle(channel, async (_event, rawInput): Promise<unknown> => {
      const parsed = contract.input.safeParse(rawInput ?? undefined);
      if (!parsed.success) {
        // In packaged builds omit the detailed Zod issues — they expose internal
        // schema structure that is unnecessary noise for the renderer.
        const { code, channel: ch, message, details } = IpcError.fromZod(
          channel,
          parsed.error,
        );
        return {
          ok: false,
          error: app.isPackaged
            ? { code, channel: ch, message }
            : { code, channel: ch, message, details },
        };
      }
      try {
        const result = await handler(parsed.data);
        return { ok: true, data: result ?? null };
      } catch (err) {
        // Always log the full error in main process; send a generic message to
        // the renderer so internal paths / stack traces don't cross the boundary.
        console.error(`[IPC] Handler error on ${channel}:`, err);
        const message = app.isPackaged
          ? "An unexpected error occurred"
          : err instanceof Error
            ? err.message
            : String(err);
        return {
          ok: false,
          error: { code: "HANDLER_ERROR", channel, message },
        };
      }
    });
  }
}
