import { registerHandlers } from "./registry";
import { createHandlers, registerResizeHandlers } from "./handlers";

export { pushEvent } from "./emitter";

export function registerIpcHandlers(): void {
  registerHandlers(createHandlers());
  registerResizeHandlers();
}
