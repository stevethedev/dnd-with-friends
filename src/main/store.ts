import Store from "electron-store";
import type { StoreSchema } from "../shared/types";
import {
  DEFAULT_DND_URL,
  DEFAULT_ROLL20_URL,
  DEFAULT_PANEL_WIDTH,
  DEFAULT_PANEL_HEIGHT,
  DEFAULT_PANEL_ID,
  TOOLBAR_HEIGHT,
} from "../shared/constants";

export const store = new Store<StoreSchema>({
  defaults: {
    lastRoll20Url: DEFAULT_ROLL20_URL,
    panels: [
      {
        id: DEFAULT_PANEL_ID,
        url: DEFAULT_DND_URL,
        width: DEFAULT_PANEL_WIDTH,
        height: DEFAULT_PANEL_HEIGHT,
        x: 0,
        y: TOOLBAR_HEIGHT,
      },
    ],
    nextPanelId: 1,
  },
});
