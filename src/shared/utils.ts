/** Prepend https:// if the URL has no scheme, so bare hostnames work. */
export function normalizeUrl(url: string): string {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
}
