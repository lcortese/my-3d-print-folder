# 3D Print Catalog

Local browser for a 3D printing model library. The app scans a folder tree on
disk into a local SQLite database and serves a single page application to
navigate it:

- **Left column** – lazy folder tree of the whole library.
- **Right column** – searchable, sortable and paginated list of the *projects*
  found in the selected folder, with a button that opens the project in the
  operating system file manager.

## Environment variables

Configuration is read from `.env` (copy `.env.example`). Values exported in the
shell win over the file.

| Variable           | Default                                | Description                                                                 |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------------- |
| `MODELS_ROOT`      | — (**required**)                       | Folder that holds one subfolder per category. No built-in default: the process stops with an error when it is missing or empty. |
| `APP_MODE`         | `develop`                              | `develop` \| `staging` \| `production` – how the web app is served.          |
| `API_MODE`         | `develop`                              | `develop` \| `staging` \| `production` – how the API runs.                   |
| `WEB_PORT`         | `5173`                                 | Port of the web app (dev server or preview).                                |
| `API_HOST`         | `127.0.0.1`                            | Interface the HTTP API binds to.                                            |
| `API_PORT`         | `4317`                                 | Port of the HTTP API.                                                       |
| `CORS_ORIGINS`     | `http://localhost:$WEB_PORT`, `http://127.0.0.1:$WEB_PORT` | Origins allowed to call the API from a browser.        |
| `DB_PATH`          | `./data/catalog.db`                    | SQLite file, created automatically.                                         |
| `MODEL_EXTENSIONS` | `.stl,.3mf,.obj,.step,.stp,.sldprt`    | Extensions that count as a model file.                                      |
| `IGNORE_DIRS`      | `node_modules,.git,.svn,.idea,.vscode` | Folders skipped by the scanner. Hidden folders (`.something`) are skipped too. |

`MODELS_ROOT` is the only mandatory variable; an invalid `APP_MODE` or
`API_MODE` stops the process with a clear message instead of falling back.

The packaged desktop app reads the same `.env` from the folder that holds its
executable. Its window always serves the built bundle, so `APP_MODE` is
`production` there: `develop` hands the UI to the Vite dev server, which a
packaged app does not have. The catalogue is created under the application
folder, or wherever `DB_PATH` points.

## Scripts

| Command                | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm start`            | Starts the app **and** the API (`start:app` + `start:api` in parallel).   |
| `npm run start:app`    | Starts the app according to `APP_MODE`.                                   |
| `npm run start:api`    | Starts the API according to `API_MODE` (scans the library when enabled).  |
| `npm run start:desktop` | Builds everything and opens the app in a desktop window (Electron).       |
| `npm run build`        | Builds the app **and** the API (`build:app` + `build:api`).               |
| `npm run build:app`    | Builds the UI into `dist/`.                                               |
| `npm run build:api`    | Compiles the API and the desktop shell into `dist-electron/`.             |
| `npm run package:win`  | Builds everything and writes the Windows app to `release/`.               |
| `npm run scan`         | Rebuilds `data/catalog.db` and exits.                                     |
| `npm run check:types`  | `tsc -b` only (the build does not type-check).                            |
| `npm run lint`         | Oxlint.                                                                   |
