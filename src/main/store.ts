import Store from "electron-store";
import type { StoreSchema } from "../shared/types";
import {
  DEFAULT_DND_URL,
  DEFAULT_ROLL20_URL,
  DEFAULT_PANEL_WIDTH,
} from "../shared/constants";

export const store = new Store<StoreSchema>({
  defaults: {
    lastRoll20Url: DEFAULT_ROLL20_URL,
    panels: [{ id: "dnd", url: DEFAULT_DND_URL, width: DEFAULT_PANEL_WIDTH }],
    nextPanelId: 1,
  },
});
