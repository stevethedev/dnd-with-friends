import { app } from "electron";
import { join, resolve, relative, isAbsolute } from "path";
import { promises as fs } from "fs";
import { z } from "zod";
import type { Beyond20Status } from "../shared/types";
import { BEYOND20_GITHUB_API } from "../shared/constants";

const GitHubAssetSchema = z.object({
  name: z.string(),
  browser_download_url: z
    .url()
    .refine(
      (url) =>
        url.startsWith("https://github.com/") ||
        url.startsWith("https://objects.githubusercontent.com/"),
      { message: "Download URL must be hosted on github.com" },
    ),
});

const GitHubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  assets: z.array(GitHubAssetSchema),
});

type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

const CACHE_DIR = "beyond20";
const VERSION_FILE = "version.txt";
const EXTENSION_DIR = "extension";

let currentStatus: Beyond20Status = { status: "idle", version: null };
let statusListener: ((status: Beyond20Status) => void) | null = null;

export function setBeyond20StatusListener(
  fn: (status: Beyond20Status) => void,
): void {
  statusListener = fn;
}

export function getBeyond20Status(): Beyond20Status {
  return currentStatus;
}

function setStatus(status: Beyond20Status): void {
  currentStatus = status;
  statusListener?.(currentStatus);
}

/**
 * Ensures the latest Beyond20 extension is downloaded and extracted.
 * Returns the path to the unpacked extension directory.
 * Falls back to cached version if GitHub is unreachable.
 */
export async function ensureLatestBeyond20(): Promise<string | null> {
  const userDataPath = app.getPath("userData");
  const cacheDir = join(userDataPath, CACHE_DIR);
  const versionFile = join(cacheDir, VERSION_FILE);
  const extensionDir = join(cacheDir, EXTENSION_DIR);

  await fs.mkdir(cacheDir, { recursive: true });

  let cachedTag: string | null = null;
  try {
    cachedTag = (await fs.readFile(versionFile, "utf-8")).trim();
  } catch {
    // First run — no cache yet
  }

  setStatus({ status: "checking", version: null });

  let release: GitHubRelease | null = null;
  try {
    const response = await fetch(BEYOND20_GITHUB_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`GitHub API returned HTTP ${response.status}`);
    const parsed = GitHubReleaseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new Error(
        `Unexpected GitHub API response: ${parsed.error.message}`,
      );
    release = parsed.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[Beyond20] GitHub API unavailable:", msg);
    if (cachedTag) {
      await patchForElectron(extensionDir);
      setStatus({ status: "offline", version: cachedTag });
      return extensionDir;
    }
    setStatus({
      status: "error",
      version: null,
      error: "GitHub unreachable and no cached version found",
    });
    return null;
  }

  const latestTag = release.tag_name;

  if (cachedTag === latestTag) {
    console.log("[Beyond20] Already up to date:", latestTag);
    await patchForElectron(extensionDir);
    setStatus({ status: "loaded", version: latestTag });
    return extensionDir;
  }

  // Prefer the chrome-specific zip; fall back to any zip in the release assets
  const assetToDownload =
    release.assets.find(
      (a) => a.name.toLowerCase().includes("chrome") && a.name.endsWith(".zip"),
    ) ?? release.assets.find((a) => a.name.endsWith(".zip"));
  if (!assetToDownload) {
    setStatus({
      status: "error",
      version: latestTag,
      error: "No zip asset found in Beyond20 release",
    });
    return null;
  }

  console.log("[Beyond20] Downloading", assetToDownload.name, "tag", latestTag);
  setStatus({ status: "downloading", version: latestTag });

  let zipBuffer: Buffer;
  try {
    const zipResponse = await fetch(assetToDownload.browser_download_url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!zipResponse.ok)
      throw new Error(`Download failed: HTTP ${zipResponse.status}`);
    zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fall back to cache if download fails
    if (cachedTag) {
      console.warn("[Beyond20] Download failed, using cached version:", msg);
      await patchForElectron(extensionDir);
      setStatus({ status: "offline", version: cachedTag });
      return extensionDir;
    }
    setStatus({
      status: "error",
      version: latestTag,
      error: `Download failed: ${msg}`,
    });
    return null;
  }

  setStatus({ status: "extracting", version: latestTag });

  await fs.rm(extensionDir, { recursive: true, force: true });
  await fs.mkdir(extensionDir, { recursive: true });

  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(zipBuffer);

  // Zip slip protection: reject any entry whose resolved path escapes extensionDir.
  // Uses path.relative() rather than string prefix matching to handle platform
  // path-separator differences (Windows backslash vs Unix forward slash).
  const resolvedRoot = resolve(extensionDir);
  for (const entry of zip.getEntries()) {
    const entryPath = resolve(extensionDir, entry.entryName);
    const rel = relative(resolvedRoot, entryPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      setStatus({
        status: "error",
        version: latestTag,
        error: `Zip entry escapes target directory: ${entry.entryName}`,
      });
      return null;
    }
  }

  zip.extractAllTo(extensionDir, true);

  await fs.writeFile(versionFile, latestTag, "utf-8");
  console.log("[Beyond20] Updated to", latestTag);

  await patchForElectron(extensionDir);
  setStatus({ status: "loaded", version: latestTag });
  return extensionDir;
}

/**
 * Applies all Electron compatibility patches to the extension directory:
 *  1. Converts MV3 manifest (service_worker) → MV2 (background scripts)
 *  2. Stubs chrome.permissions.onAdded/onRemoved which Electron doesn't implement
 *
 * Safe to call repeatedly — patches are idempotent.
 */
async function patchForElectron(extensionDir: string): Promise<void> {
  await patchManifest(extensionDir);
  await patchBackgroundScript(extensionDir);
}

async function patchManifest(extensionDir: string): Promise<void> {
  const manifestPath = join(extensionDir, "manifest.json");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf-8");
  } catch {
    console.warn("[Beyond20] manifest.json not found; skipping manifest patch");
    return;
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn(
      "[Beyond20] manifest.json is malformed; skipping manifest patch",
    );
    return;
  }
  let dirty = false;

  // 1. Convert MV3 service_worker → MV2 background scripts
  const background = manifest.background as Record<string, unknown> | undefined;
  if (background?.service_worker) {
    const serviceWorkerFile = background.service_worker as string;
    manifest.manifest_version = 2;
    manifest.background = { scripts: [serviceWorkerFile], persistent: false };
    dirty = true;
  }

  // 2. MV2 uses browser_action instead of action
  if (manifest.action) {
    manifest.browser_action = manifest.action;
    delete manifest.action;
    dirty = true;
  }

  // 3. Merge host_permissions / optional_host_permissions into permissions (MV3 → MV2)
  const existingPerms = Array.isArray(manifest.permissions)
    ? (manifest.permissions as string[])
    : [];
  if (Array.isArray(manifest.host_permissions)) {
    const merged = [
      ...new Set([
        ...existingPerms,
        ...(manifest.host_permissions as string[]),
      ]),
    ];
    manifest.permissions = merged;
    delete manifest.host_permissions;
    dirty = true;
  }
  if (manifest.optional_host_permissions) {
    delete manifest.optional_host_permissions;
    dirty = true;
  }
  // Remove 'scripting' permission — MV3-only API, not valid in MV2
  if (Array.isArray(manifest.permissions)) {
    const filtered = (manifest.permissions as string[]).filter(
      (p) => p !== "scripting",
    );
    if (filtered.length !== (manifest.permissions as string[]).length) {
      manifest.permissions = filtered;
      dirty = true;
    }
  }

  // 4. Flatten MV3 web_accessible_resources [{resources:[...], matches:[...]}]
  //    → MV2 flat string array
  if (Array.isArray(manifest.web_accessible_resources)) {
    const war = manifest.web_accessible_resources as Array<unknown>;
    if (war.length > 0 && typeof war[0] === "object" && war[0] !== null) {
      const flat: string[] = [];
      for (const entry of war) {
        const e = entry as { resources?: string[] };
        if (Array.isArray(e.resources)) flat.push(...e.resources);
      }
      manifest.web_accessible_resources = [...new Set(flat)];
      dirty = true;
    }
  }

  if (dirty) {
    await fs.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
    console.log("[Beyond20] Patched manifest.json → MV2 compatible");
  }
}

async function patchBackgroundScript(extensionDir: string): Promise<void> {
  // Electron doesn't implement chrome.permissions.onAdded / onRemoved.
  // Beyond20's background.js calls .addListener() on these at the top level,
  // crashing the entire background script. We guard them with existence checks.
  const bgPath = join(extensionDir, "dist", "background.js");
  let src: string;
  try {
    src = await fs.readFile(bgPath, "utf-8");
  } catch {
    return; // No background script to patch
  }

  const SENTINEL = "/* electron-patched */";
  if (src.includes(SENTINEL)) return; // Already patched

  // Replace the two problematic lines with null-guarded versions
  const patched = src
    .replace(
      /chromeOrBrowser\.permissions\.onAdded\.addListener\(([^)]+)\)/g,
      "chromeOrBrowser.permissions.onAdded?.addListener($1)",
    )
    .replace(
      /chromeOrBrowser\.permissions\.onRemoved\.addListener\(([^)]+)\)/g,
      "chromeOrBrowser.permissions.onRemoved?.addListener($1)",
    );

  await fs.writeFile(bgPath, SENTINEL + "\n" + patched, "utf-8");
  console.log("[Beyond20] Patched background.js (permissions API stubs)");
}
