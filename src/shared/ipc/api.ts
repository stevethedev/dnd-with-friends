import { z } from "zod";
import { BEYOND20_STATUSES } from "../types";
import { isHttpUrl } from "../utils";

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const HttpUrlSchema = z.string().refine(isHttpUrl, {
  message: "Must be an http/https URL",
});

const PanelInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  isOpen: z.boolean(),
  width: z.number(),
});

const Beyond20StatusSchema = z.object({
  status: z.enum(BEYOND20_STATUSES),
  version: z.string().nullable(),
  error: z.string().optional(),
});

// ── API definition ────────────────────────────────────────────────────────────

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
    "panel.toggle": {
      input: z.object({ id: z.string().min(1) }),
      output: z.array(PanelInfoSchema),
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
  },
  observe: {
    "panel.listUpdated": z.array(PanelInfoSchema),
    "panel.urlChanged": z.object({ id: z.string(), url: z.string() }),
    "roll20.urlChanged": z.string(),
    "beyond20.statusUpdated": Beyond20StatusSchema,
    "window.maximizeChanged": z.boolean(),
  },
} as const;

export const INVOKE_CHANNELS = new Set(Object.keys(API.invoke));
export const OBSERVE_CHANNELS = new Set(Object.keys(API.observe));
