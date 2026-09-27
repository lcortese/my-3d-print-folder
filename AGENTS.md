# Working agreements

Conventions agreed with the user for this repository. The agent reads them at the
start and follows them for the whole session. `README.md` documents how the app
works; this file documents how the code is written and organised.

## Interaction

- **The user asks, the agent does, the user verifies.** Do not verify on your own:
  no starting servers, no hitting endpoints, no opening windows, no runtime tests,
  no "just in case" checks.
- **Do not make changes that were not requested.** If something looks necessary or
  convenient, say it and wait for approval.
- If a request is ambiguous or destructive, **ask before acting**; never guess or
  decide on the user's behalf.
- Do not widen the scope: the diff answers exactly what was asked.
- The user runs the app while the agent works; do not start it or check that it is
  alive.
- When a change spans several files, write the **defining side first** (the
  interface or the type) and the using side afterwards, so the repository is never
  left inconsistent between edits.

## Code

- Code and comments **in English**, including UI copy.
- **No unit tests.**
- **No machine-specific hardcoded values.** A required variable with no value
  stops the process with a clear message; the remaining defaults are application
  properties (ports, extensions, relative paths) and are documented.
- **Absence is `undefined`**, never an invented empty value (`''`, `0`, `'library'`,
  an empty array). `null` is reserved for the cases where it is the value the other
  side speaks: the HTTP contract (JSON has no `undefined`), React's context
  sentinel, the `cond ? ... : null` JSX idiom, and the DOM/Radix sentinels where a
  string is mandatory (an input's value, a `SelectItem` that cannot be empty).
- No new dependencies without asking.
- **`useRef` only to reference elements.** Mutable data, previous values and caches
  belong to React state.
- Files under `src/components/ui/*` are shadcn output: not edited by hand unless
  explicitly requested.

## Folder layout

    src/
    ├── App.tsx            context wrappers + router; mounts the app header
    ├── router.tsx         every route of the app
    ├── pages/**           one file per route ("/" -> pages/index.tsx)
    ├── components/
    │   ├── ui/**          atomic, reusable (shadcn)
    │   └── app-header.tsx the only app-wide non-atomic component here
    ├── hooks/**           reusable, entity agnostic hooks (use-debounced-value)
    ├── lib/**             infrastructure: http, resource-store, use-api-resource,
    │                      format, utils
    ├── Projects/**        module
    ├── Trees/**           module
    └── Status/**          module

- **A module is a folder for one entity of the project** and holds its layers:
  `api.ts` (or `api/index.ts` + `api/types.ts`), `hooks/`, `components/`.
- **Sibling modules may import each other** (for example `Projects` renders the
  `Trees` tree). A module exposes its `api`, its hooks and its components; nothing
  reaches into another module's internals.
- Module types are derived from the shared contract in the module's api layer
  (`Pick<ProjectQuery, 'scope' | 'q'>`) and the api re-exports the types its
  consumers need, so files inside a module never reach into `shared/` by path.

## Routes and page components

- `pages/**` mirrors the routes. **The page `index` owns the URL**: it reads and
  sanitizes the query string, mounts the page component with those parameters as
  props, and writes back every change the page asks for. Filters live in the URL.
- Page components are parameterised **by groups, never by a generic `params` bag**:
  `filters`, `sorting`, `pagination`, each one a type of its own defined in the
  module's api layer.
- Page props receive the groups **complete**, plus one callback per group:
  `onFiltersChange`, `onSortingChange`, `onPaginationChange`. Callbacks take the
  complete group, never a `Partial` patch.
- A rule that spans groups is resolved where the write happens: "changing filters
  or sorting goes back to page 1" is applied by the route in the same write, so
  there is never a second navigation.
- A page component negotiates with its module hooks; it never fetches.

## URL state

- The query string is written **only by user interactions**. The code never
  rewrites or sanitizes a parameter inside the URL: it sanitizes on read
  (`readParams`). Nothing that comes from a response is written back into the URL;
  the UI reflects it instead (a page clamped by the server is drawn, not stored).
- Typing is never bound to the URL: the input keeps a local draft (intermediate
  state) and a debounce decides when the value travels to the URL; from there it
  comes back as a prop and that is what the request uses.

## Data layer

- Hooks resolve data through the resource index in `lib/resource-store.ts`, keyed
  by the parametrization: components asking for the same key share one request, a
  cached key is served instantly and revalidated in the background, and every
  subscriber receives the new values.
- The api layer only builds requests (`lib/http.ts` plus each module's `api.ts`);
  the hook layer decides when to call them.
- A hook that resolves a growing set of keys (the tree levels) keeps them in hook
  state and shares in-flight requests with a module level map keyed by folder.

## Domain and platform decisions

- `/api/tree` is the single source for navigation **and** for the category list
  (its first level); `/api/projects` serves the table listing. There is no
  categories endpoint: the category stays a data level concept (the `category`
  column, its index and `Catalog.categories()`).
- The scan runs on boot **only when there is no catalogue yet**; afterwards the
  user refreshes it from the UI (**Rescan**, which reloads the page) or with
  `npm run scan`.
- Project dates come from the model files, never from the folder: creation is the
  **oldest** file creation and modification the **newest** file modification; the
  folder is a last resort for a project whose files cannot be read. A file's
  creation falls back `birthtime -> mtime -> ctime`.
- The theme follows the operating system (`prefers-color-scheme`, applied before
  the first paint; the toaster uses `theme="system"`).
- Scripts are `start`, `start:app`, `start:api`, `start:desktop`, `build`,
  `build:app`, `build:api`, `package:win`, `scan`, `check:types` and `lint`:
  **nothing called `dev`**. `APP_MODE`/`API_MODE` decide how the app and the API
  start (details in `README.md`).
