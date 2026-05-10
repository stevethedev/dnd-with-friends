import { registerHandlers } from "./registry";
import { createHandlers } from "./handlers";

export { pushEvent } from "./emitter";

export function registerIpcHandlers(): void {
  registerHandlers(createHandlers());
}
