import React from "react";
import { useBeyond20 } from "../hooks/useBeyond20";
import type { Beyond20LoadStatus } from "../../../shared/types";

// Labels for transitional and error states; "loaded"/"offline" are handled
// explicitly in the render because they embed the version string.
const STATUS_LABELS: Record<
  Exclude<Beyond20LoadStatus, "loaded" | "offline">,
  string
> = {
  idle: "Beyond20",
  checking: "Checking...",
  downloading: "Downloading...",
  extracting: "Extracting...",
  loading: "Loading...",
  error: "Error",
};

export function Beyond20Status(): React.JSX.Element {
  const s = useBeyond20();

  // Discriminated union gives us type-safe access to .version and .error
  // without null checks — TypeScript knows which fields exist per status.
  const label =
    s.status === "loaded"
      ? `B20 ${s.version}`
      : s.status === "offline"
        ? `B20 ${s.version} (offline)`
        : STATUS_LABELS[s.status];

  const title =
    s.status === "error"
      ? `Beyond20 error: ${s.error}`
      : s.status === "loaded"
        ? `Beyond20 ${s.version} active`
        : s.status === "offline"
          ? `Beyond20 ${s.version} — running from cache (offline)`
          : label;

  return (
    <div
      className="toolbar__b20"
      role="status"
      title={title}
      aria-label={title}
    >
      <span className={`toolbar__b20-dot toolbar__b20-dot--${s.status}`} />
      <span className="toolbar__b20-label">{label}</span>
    </div>
  );
}
