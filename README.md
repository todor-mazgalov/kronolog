# Kronolog

A small, self-contained time-tracking web app. Log time against projects, see a
monthly calendar of your entries, and a per-project hours breakdown. Everything is
stored locally in your browser — no account, no server, no build step.

## Run it

Open `index.html` in any modern browser (double-click it, or serve the folder):

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

There are no dependencies and nothing to install. The Google Fonts links are the
only network request; the app works offline without them (falls back to system fonts).

## Features

- **Log time** by duration (e.g. `2.5` hours) or by start–end range.
- Optional **ticket**, **description**, and comma-separated **tags** per entry.
- **Monthly calendar** with colored per-entry chips; click a chip to delete it.
- **Hours by project** bar chart with the month's grand total.
- **Project picker** chips for quick reuse of existing project names.
- **Remove a project** with a choice to hide it from the picker or permanently
  delete its logged entries.
- **Workday fill**: each day with logged time fills its cell from left to right,
  proportional to your daily target (4h of an 8h day fills the left half; 8h fills
  the whole cell). Overtime beyond the target is shown as accent-colored diagonal
  stripes growing left to right, their width being the overtime as a share of the
  workday (2h over an 8h day = 25% striped), capped at the full cell width. Days
  that reach or exceed the target are marked complete with a bold accent border
  and a checkmark by the day total. Set the target via the **⚙ Settings** button next
  to Restore (default 8h, stored locally under `tt_workday_v1`).
- **Themes**: six color themes — warm, ocean, forest, plum, slate, rose — picked
  in **⚙ Settings**. Switching restyles the app (and the favicon) live. The choice
  is persisted under `tt_theme`.
- **Project color palettes**: six palettes — vivid, pastel, earthy, sunset, cool,
  candy — chosen in **⚙ Settings**; they control the colors assigned to projects
  across chips, the calendar, and the chart. Persisted under `tt_palette`.
- **CSV export**, **JSON backup**, and **JSON restore** (import merges by entry id,
  so re-importing a backup never duplicates).

## Data

Entries and settings are stored in **IndexedDB** (database `kronolog`, store `kv`,
keys `tt_entries_v1`, `tt_hidden_v1`, `tt_workday_v1`, `tt_theme`, `tt_palette`). On load the app calls
`navigator.storage.persist()` to ask the browser not to evict the data under
storage pressure — making it considerably more durable than plain `localStorage`.

`localStorage` is still written as a fast-startup cache and as the migration
source: an existing `localStorage`-only install is migrated into IndexedDB on
first load, and if the `localStorage` cache is ever cleared, the data is recovered
from IndexedDB on the next load. On browsers/contexts where IndexedDB is
unavailable, the app falls back to `localStorage` only.

This is still single-browser storage — for an off-device copy, use **Backup** to
export a JSON file and **Restore** to import it (import merges by entry id, so
re-importing never duplicates).

## Implementation

Single file, vanilla JavaScript — no framework, no bundler. Logic and styling were
implemented from the `Timesheet.dc.html` design in the *"Time tracking web app"*
Claude Design project, then extended (workday targets, themes, IndexedDB storage).

## Tests

The app itself has no dependencies; the tests do. Install dev dependencies and run:

```sh
npm install
npm test
```

This loads `index.html` in [jsdom](https://github.com/jsdom/jsdom) and drives it like
a user (`test/smoke.test.js`) — adding entries, validation, CSV export, the
remove-project dialog, the workday fill / overtime stripes / completion lock,
theme switching, and JSON import. A second suite (`test/idb.test.js`) uses
[fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) to verify the storage
layer: migration from a localStorage-only install, dual-writes, and recovery from
IndexedDB after the localStorage cache is cleared. `test/run.js` runs both and is
what `npm test` invokes. Each file can also be run directly, e.g.
`node test/smoke.test.js`.

## Hosting (GitHub Pages)

The app is a single static `index.html` with no build step, so GitHub Pages can
serve it directly:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   then pick your default branch and the `/ (root)` folder.

It then loads at `https://<user>.github.io/<repo>/`. All asset references are
absolute (Google Fonts, the Ko-fi link) or inline (the favicon is a data URI), so
it works correctly under a project subpath — no `<base>` tag needed. A `.nojekyll`
file is included so Pages serves every file verbatim (no Jekyll processing). The
`test/`, `package.json`, and `node_modules` paths are harmless if published but
aren't referenced by the page.

## License

[MIT](LICENSE) © Todor Mazgalov
