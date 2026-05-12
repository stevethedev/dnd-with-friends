import { registerHandlers } from "./registry";
import { createHandlers } from "./handlers";
import { registerRoll20BridgeHandlers } from "./roll20Bridge";

export { pushEvent } from "./emitter";

export function registerIpcHandlers(): void {
  registerHandlers(createHandlers());
  registerRoll20BridgeHandlers();
}
