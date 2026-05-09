# D&D with Friends

A desktop app that puts [D&D Beyond] and [Roll20] in the same window. Roll dice on D&D Beyond and they show up in Roll20
automatically, handled by the [Beyond20] extension — which the app downloads and keeps up to date for you.

The toolbar across the top controls everything. Roll20 lives in the main view behind it; D&D Beyond (or whatever other
panels you want to open) slide in as a panel from the left. You can open multiple panels, so if you want to use one for
your character sheet, one for a spell list, and one for your notes-taking, you can, and it will save your open tabs
between sessions.

## Install

Download the latest release for your platform from [Releases]:

| Platform | Format                   |
|----------|--------------------------|
| Windows  | NSIS installer (x64)     |
| macOS    | DMG (x64, Apple Silicon) |
| Linux    | AppImage (x64)           |

No manual Beyond20 setup required — the app fetches the extension from GitHub on first launch and updates
it automatically.

## Developing

Requires Node.js 24+.

```bash
npm install
npm run dev        # electron-vite dev server with hot reload
npm run check      # typecheck + lint + format + unused-dep check
npm run fix        # fix auto-fixable issues
npm run build      # production build to out/
npm run package    # build + package for the current platform into /dist
```

The packaged output lands in `dist/`. For cross-platform builds, push a release tag (see below) and let CI handle it.

## How it works

The app runs as a standard Electron main/renderer split with one wrinkle: the actual web content (D&D Beyond, Roll20)
never touches the renderer. Instead, each site runs in its own sandboxed `WebContentsView` in the main process. The
renderer is a small (48px tall) React app taking up the toolbar, and talks to the main process over a typed IPC bridge.

```
BrowserWindow
├─ toolbar renderer (React)       ← only this goes through the normal preload
├─ WebContentsView: Roll20        ← full-window, behind the toolbar
├─ WebContentsView: panel #1      ← slides in from the left, on top of Roll20
└─ WebContentsView: resize handle ← transparent drag-capture overlay
```

IPC channels are defined in `src/shared/ipc/api.ts` as Zod schemas. The TypeScript types are derived from the schemas,
with a compile-time assertion that catches any drift between the two. Input validation runs in the main process before
any handler sees a message.

Beyond20 is downloaded as a zip from GitHub Releases, extracted to the app's user-data directory, and patched from MV3
to MV2 format (Electron's extension host doesn't support service workers). The patch is idempotent, so the app is safe
to relaunch mid-update.

## Cutting a release

This project uses [Changesets]. When you've made changes worth versioning:

```bash
npm run changeset   # pick patch / minor / major, write a short description
git add .changeset/
git commit -m "chore: changeset"
git push
```

The CI action will open a **Version Packages** PR that bumps `package.json` and appends to `CHANGELOG.md`. Merge it when
you're ready to ship — the action tags the commit, which kicks off the cross-platform release builds.

You don't need a changeset on every commit. Push freely; the Version PR accumulates until you merge it.

## License

MIT

--

[Beyond20]: https://beyond20.here-for-more.info/
[Changesets]: https://github.com/changesets/changesets
[D&D Beyond]: https://www.dndbeyond.com/
[Releases]: https://github.com/stevethedev/dnd-with-friends/releases
[Roll20]: https://app.roll20.net/
