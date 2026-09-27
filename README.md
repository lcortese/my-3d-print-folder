# 3D Print Catalog

Local browser for a 3D printing model library. The app scans a folder tree on
disk into a local SQLite database and serves a single page application to
navigate it:

- **Left column** – lazy folder tree of the whole library.
- **Right column** – searchable, sortable and paginated list of the *projects*
  found in the selected folder, with a button that opens the project in the
  operating system file manager.

Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui (Radix
primitives)**, with **react-router** for routing and **TanStack Table** for the
listing, on the frontend; **Express 5 + `node:sqlite`** on the backend. The
database is written by the scanner and only read while serving the UI.

---

## 1. Requirements

- **Node.js 22.5 or newer** (the backend uses the built-in `node:sqlite`
  module; developed and verified on Node 24).
- A 3D model library on disk, organised as:

```
<MODELS_ROOT>/
├── Decoration/          <- first level folders are the categories
│   ├── Vase/            <- any depth is supported
│   │   ├── vase.stl     <- a folder with model files is a "project"
│   │   └── lid.stl
│   └── Frames/
│       └── 4x6/
│           └── frame.3mf
├── Printers/
└── Tools/
```

## 2. Setup

```bash
npm install
cp .env.example .env     # then edit MODELS_ROOT
npm start                # web + API; scans only when there is no catalogue yet
```

Then open the URL printed on boot: <http://localhost:5173> with the default
`APP_MODE=develop` (Vite dev server), or <http://127.0.0.1:4317> when
`APP_MODE=production`.

## 3. Scripts

| Command              | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `npm start`          | Starts the web **and** the API (`start:web` + `start:server` in parallel).          |
| `npm run start:web`  | Starts the web app according to `APP_MODE`.                                         |
| `npm run start:server` | Starts the API according to `API_MODE` (scans the library when enabled).           |
| `npm run build`      | Type-checks everything and builds the UI into `dist/`.                              |
| `npm run scan`       | Rebuilds `data/catalog.db` and exits. Useful from a cron job or a git hook.         |
| `npm run typecheck`  | `tsc -b` only.                                                                       |
| `npm run lint`       | Oxlint.                                                                              |

The server scans the library **only when there is no catalogue yet**: an
existing `data/catalog.db` is used as is, so a restart is instant. Refresh it
whenever you want from the **Rescan** button in the header (the page reloads by
itself when the scan finishes), or with `npm run scan` (cron, git hook, CI).
While a scan is running the API answers right away, `/api/status` reports
`scanning: true` and the UI shows a progress banner.

## 4. Modes

Two variables in `.env` select the runtime behaviour. Both accept
`develop`, `staging` or `production`; an invalid value stops the process with a
clear message instead of silently falling back.

| Variable      | Mode         | `npm run start:web`                                    | `npm run start:server`                                  |
| ------------- | ------------ | ------------------------------------------------------ | ------------------------------------------------------- |
| `APP_MODE`    | `develop`    | `vite` dev server: no build, hot reload                | –                                                       |
| `APP_MODE`    | `staging`    | `vite preview` of `dist/` (builds once if missing)     | –                                                       |
| `APP_MODE`    | `production` | `vite preview` of `dist/` (builds once if missing)     | –                                                       |
| `API_MODE`    | `develop`    | –                                                      | `tsx watch`: reloads on change, verbose logs            |
| `API_MODE`    | `staging`    | –                                                      | `tsx`: no reload, verbose logs                          |
| `API_MODE`    | `production` | –                                                      | `tsx`: no reload, quiet logs                            |

Both the Vite dev server and `vite preview` listen on `WEB_PORT` and proxy
`/api` to the API, so the browser always talks to a single origin.

Additionally, **outside of `APP_MODE=develop` the API also serves the built
UI**. That means a production deployment can run only:

```bash
npm run start:server        # single process: UI + API on http://127.0.0.1:4317
```

### How Vite serves things (worth knowing)

- `vite` (dev server) serves the **source** with on-the-fly transforms, HMR and
  no build step. It is meant for development, not for a real deployment.
- `vite preview` **does not compile anything**: it is a small static file server
  for the contents of `dist/`. It needs a previous `vite build`.
- `vite build` produces the optimised static bundle in `dist/`.

So the only way to "serve without compiling" is the dev server; `vite preview`
is the way to serve an already built bundle. `npm run start:web` handles this:
in `staging`/`production` it runs `vite build` once if `dist/index.html` is
missing, and never rebuilds silently afterwards (run `npm run build` to refresh
the bundle).

## 5. Environment variables (`.env`)

| Variable           | Default                                | Description                                                                 |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------------- |
| `APP_MODE`         | `develop`                              | `develop` \| `staging` \| `production` – how the web app is served.          |
| `API_MODE`         | `develop`                              | `develop` \| `staging` \| `production` – how the API runs.                   |
| `MODELS_ROOT`      | — (**required**)                       | Folder that holds one subfolder per category. No built-in default: the process stops with an error when it is missing or empty. |
| `WEB_PORT`         | `5173`                                 | Port of the web app (dev server or preview).                                |
| `API_HOST`         | `127.0.0.1`                            | Interface the HTTP API binds to.                                            |
| `API_PORT`         | `4317`                                 | Port of the HTTP API.                                                       |
| `CORS_ORIGINS`     | `http://localhost:$WEB_PORT`, `http://127.0.0.1:$WEB_PORT` | Origins allowed to call the API from a browser.        |
| `DB_PATH`          | `./data/catalog.db`                    | SQLite file, created automatically.                                         |
| `MODEL_EXTENSIONS` | `.stl,.3mf,.obj,.step,.stp,.sldprt`    | Extensions that count as a model file.                                      |
| `IGNORE_DIRS`      | `node_modules,.git,.svn,.idea,.vscode` | Folders skipped by the scanner. Hidden folders (`.something`) are skipped too. |

Values exported in the shell win over `.env`, so a one-off run is easy:

```bash
APP_MODE=production API_MODE=production npm start
WEB_PORT=5199 npm run start:web
```

`MODELS_ROOT` is the only mandatory variable: it has no hardcoded fallback, so a
missing or empty value stops the process with an actionable message instead of
silently browsing the wrong folder. The remaining variables fall back to the
application defaults listed above (they are not installation specific).

## 6. How a project is detected

- The scanner walks `MODELS_ROOT` completely (any nesting depth).
- A folder that **directly contains at least one model file** becomes a project.
- The **category** is always the first path segment under the root. Model files
  that sit directly in the root are reported under the `(root)` category.
- `created at` is the **oldest creation time among the model files** of the
  project and `modified at` is the **newest modification time among those
  files**. The folder's own timestamps are ignored on purpose: a folder that was
  moved, renamed or reorganised looks newer than the content it holds. The
  folder is used only as a last resort, when no model file can be read.
- A file's creation time uses the filesystem birth time when it is available. On
  Linux mounts of Windows drives (`/mnt/d`, 9p) birth time is not reported and
  `ctime` is the moment the file was copied or its metadata changed, so the
  modification time is used as the creation proxy instead. `ctime` stays only as
  a last resort. The UI tooltip states which source was used for the oldest file
  of the project.

The scan is fully parallel (16 folder reads in flight) and takes about **4
seconds** for ~3 300 folders / 4 500 model files on a WSL drive mount.

## 7. HTTP API

| Method | Route               | Description                                                                 |
| ------ | ------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/status`       | Root path, counters, last scan time, `scanning` flag, last error.           |
| `GET`  | `/api/tree?path=`   | Direct children of one folder (`path` is relative, empty means the root). The first level is the category list, with project counters per category. |
| `GET`  | `/api/projects`     | Paginated listing: `scope`, `q`, `sort`, `dir`, `page`, `pageSize`.         |
| `POST` | `/api/scan`         | Starts a background rescan (`202`); poll `/api/status` until `scanning:false`. |
| `POST` | `/api/reveal`       | Opens a folder/file in the OS file manager: `{ projectId }` or `{ relPath }`, plus `selectFile`. |

`sort` accepts `name`, `category`, `createdAt`, `modifiedAt`, `modelCount` and
`modelBytes`. Requests to reveal a path outside `MODELS_ROOT` are rejected.

Opening the file manager is platform aware: `explorer.exe` (with `/select`) on
Windows and WSL, `open`/`open -R` on macOS and `xdg-open` on Linux.

## 8. Project layout

```
scripts/                Entry points behind the npm start* scripts
├── start-web.ts        picks vite dev server or vite preview from APP_MODE
├── start-server.ts     picks tsx watch or tsx from API_MODE
└── lib/run.ts          cross platform child process helpers
server/                 Node backend (run with tsx)
├── config.ts           .env parsing, runtime modes, fail fast validation
├── scanner.ts          parallel filesystem walk -> projects + folder tree
├── db.ts               SQLite schema, catalogue writes and all queries
├── reveal.ts           opens the OS file manager (Windows / WSL / macOS / Linux)
├── index.ts            Express app, API routes, static UI, boot sequence
└── scan-cli.ts         `npm run scan`
shared/types.ts         API contract shared by the backend and the frontend
src/                    React SPA
├── App.tsx             context wrappers + router; mounts the app header
├── router.tsx          every route of the application
├── pages/              one file per route ("/" -> pages/index.tsx)
├── components/
│   ├── ui/             atomic, reusable components (shadcn/ui)
│   └── app-header.tsx  the only app-wide non-atomic component
├── hooks/              reusable, entity agnostic hooks (use-debounced-value)
├── lib/                infrastructure: http, resource store, fetch hook, format
├── Projects/           module: api, hooks and components of the projects page
├── Trees/              module: api, hook and the folder tree component
└── Status/             module: api, context, provider and hook of the catalogue
data/catalog.db         generated catalogue (git ignored)
```

The interface is organised in **modules**: a folder per entity of the project
(`Projects`, `Trees`, `Status`), each one holding its own `api`, `hooks` and
`components`. Sibling modules may use each other's public pieces (the projects
page renders the tree of `Trees`).

The conventions the code follows — folder layout, how page components are
parameterised, URL state, the data layer — are documented in `AGENTS.md`.

## 9. Notes

- The SQLite file is a **cache**: deleting `data/` and running `npm run scan`
  rebuilds it from scratch. A schema revision bump rebuilds it automatically.
- The interface language is English; all code and comments are English as well.
- Only the catalogued folders are read: the scanner never writes to, moves or
  deletes anything inside `MODELS_ROOT`.
