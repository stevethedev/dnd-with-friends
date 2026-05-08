import { ipcMain } from "electron";
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
        return { ok: false, error: IpcError.fromZod(channel, parsed.error) };
      }
      try {
        const result = await handler(parsed.data);
        return { ok: true, data: result ?? null };
      } catch (err) {
        console.error(`[IPC] Handler error on ${channel}:`, err);
        return { ok: false, error: IpcError.serialize(err, channel) };
      }
    });
  }
}
