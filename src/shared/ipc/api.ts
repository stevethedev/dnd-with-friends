import { z } from "zod";
import type { Beyond20Status } from "../types";
import { isHttpUrl } from "../utils";

const HttpUrlSchema = z.string().refine(isHttpUrl, {
  message: "Must be an http/https URL",
});

const PanelInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["open", "minimized"]),
  width: z.number(),
  height: z.number(),
  x: z.number(),
  y: z.number(),
  zIndex: z.number(),
  favicon: z.string().nullable(),
});

// One variant per status value so z.discriminatedUnion can use O(1) lookup.
const Beyond20StatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle"), version: z.null() }),
  z.object({ status: z.literal("checking"), version: z.null() }),
  z.object({ status: z.literal("downloading"), version: z.string() }),
  z.object({ status: z.literal("extracting"), version: z.string() }),
  z.object({ status: z.literal("loading"), version: z.string() }),
  z.object({ status: z.literal("loaded"), version: z.string() }),
  z.object({ status: z.literal("offline"), version: z.string() }),
  z.object({
    status: z.literal("error"),
    version: z.string().nullable(),
    error: z.string(),
  }),
]);

// Compile-time guard: TypeScript errors here if the Zod schema and the
// Beyond20Status discriminated union type in types.ts ever diverge.
type _AssertSchemaSync =
  z.infer<typeof Beyond20StatusSchema> extends Beyond20Status
    ? Beyond20Status extends z.infer<typeof Beyond20StatusSchema>
      ? true
      : never
    : never;
const _assertSchemaSync: _AssertSchemaSync = true;
void _assertSchemaSync;

export const API = {
  invoke: {
    "panel.list": { input: z.void(), output: z.array(PanelInfoSchema) },
    "panel.create": {
      input: z.object({ url: HttpUrlSchema }),
      output: PanelInfoSchema,
    },
    "panel.remove": {
      input: z.object({ id: z.string().min(1) }),
      output: z.array(PanelInfoSchema),
    },
    "panel.minimize": {
      input: z.object({ id: z.string().min(1) }),
      output: z.array(PanelInfoSchema),
    },
    "panel.restore": {
      input: z.object({ id: z.string().min(1) }),
      output: z.array(PanelInfoSchema),
    },
    "panel.focus": {
      input: z.object({ id: z.string().min(1) }),
      output: z.array(PanelInfoSchema),
    },
    "panel.move": {
      input: z.object({
        id: z.string().min(1),
        x: z.number(),
        y: z.number(),
        final: z.boolean().optional(),
      }),
      output: z.void(),
    },
    "panel.resize": {
      input: z.object({
        id: z.string().min(1),
        width: z.number(),
        height: z.number(),
        final: z.boolean().optional(),
      }),
      output: z.void(),
    },
    "panel.navigate": {
      input: z.object({ id: z.string().min(1), url: HttpUrlSchema }),
      output: z.void(),
    },
    "panel.getUrl": {
      input: z.object({ id: z.string().min(1) }),
      output: z.string(),
    },
    "roll20.navigate": {
      input: z.object({ url: HttpUrlSchema }),
      output: z.void(),
    },
    "roll20.getUrl": { input: z.void(), output: z.string() },
    "beyond20.getStatus": { input: z.void(), output: Beyond20StatusSchema },
    "window.minimize": { input: z.void(), output: z.void() },
    "window.maximize": { input: z.void(), output: z.void() },
    "window.close": { input: z.void(), output: z.void() },
    "window.isMaximized": { input: z.void(), output: z.boolean() },
    "overlay.setIgnoreMouseEvents": {
      input: z.object({ ignore: z.boolean() }),
      output: z.void(),
    },
  },
  observe: {
    "panel.listUpdated": z.array(PanelInfoSchema),
    "panel.urlChanged": z.object({ id: z.string(), url: z.string() }),
    "roll20.urlChanged": z.string(),
    "roll20.panelMessage": z.object({ panelId: z.string(), data: z.unknown() }),
    "beyond20.statusUpdated": Beyond20StatusSchema,
    "window.maximizeChanged": z.boolean(),
  },
} as const;

export const INVOKE_CHANNELS = new Set(Object.keys(API.invoke));
export const OBSERVE_CHANNELS = new Set(Object.keys(API.observe));
