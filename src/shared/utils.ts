/** Prepend https:// if the URL has no scheme, so bare hostnames work. */
export function normalizeUrl(url: string): string {
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

/** Return true only for well-formed http or https URLs. */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
