# Pokemon Randomizer Web App

A web frontend for [Universal Pokemon Randomizer ZX](https://github.com/Ajarmar/universal-pokemon-randomizer-zx)
(GPL-3.0). Upload your own legally-owned ROM, configure randomization
options, and download a randomized ROM — all generations, Gen 1 through 7
(including 3DS).

Design spec: [`docs/superpowers/specs/2026-07-20-pokemon-randomizer-webapp-design.md`](docs/superpowers/specs/2026-07-20-pokemon-randomizer-webapp-design.md).

We don't fork or reimplement the randomizer. We vendor the official,
unmodified release jar and drive it through its existing headless CLI mode.
The web form's ~150 settings are extracted from the real `Settings` class
into `java-shim/settings-schema.json` (see that file's `sourceTag`), which
also drives a small Java shim (`java-shim/`) that calls the real setters to
produce the binary settings file the CLI expects — no reimplementation of
its format.

## Structure

```
apps/web       React + TS frontend
apps/api       Express + TS — uploads, jobs, downloads
apps/worker    BullMQ consumer — shells out to the shim + randomizer CLI
packages/shared    Shared TS types/config used by api and worker
java-shim/     SettingsBuilder.java (generated) + its generator + the schema
infra/         nginx config for the web container
docker-compose.yml
```

## Running locally (without Docker)

Requires Node 20+, a JDK (17 is fine), Redis running locally, and the
vendored jar + shim on disk (see `apps/worker/Dockerfile` for exactly how
these are fetched/compiled — for local dev without Docker you'd replicate
those steps manually and point `RANDOMIZER_JAR_PATH` /
`SETTINGS_SHIM_JAR_PATH` at the results).

```
npm install
npm run build -w packages/shared
npm run dev:api      # apps/api, needs REDIS_URL
npm run dev:worker   # apps/worker, needs the vendored jar + shim
npm run dev:web      # apps/web, proxies /api to :3001
```

## Running with Docker Compose

```
cp .env.example .env   # adjust limits/timeouts if needed
docker compose up --build
```

The `worker` image's build downloads the official release zip and a small
JSON library from Maven Central, both pinned by version and verified by
sha256 (see the `ARG`s at the top of `apps/worker/Dockerfile`) — nothing is
fetched unpinned. Bumping the vendored randomizer version means updating
those `ARG`s and regenerating the schema/shim:

```
# 1. update sourceTag/URLs, re-run the extraction against the new tag
# 2. node java-shim/generate-shim.mjs
# 3. update RANDOMIZER_VERSION/RANDOMIZER_ZIP_SHA256 in apps/worker/Dockerfile
```

## Legal / privacy

- This site does not host, distribute, or catalog game ROMs. Every upload
  is user-supplied, processed, and deleted automatically after
  `JOB_RETENTION_HOURS` (default 24h) regardless of download status.
- Users must confirm they own a legal copy of the game before a job runs.
- Built on the GPL-3.0-licensed Universal Pokemon Randomizer ZX — see that
  project's [license](https://github.com/Ajarmar/universal-pokemon-randomizer-zx/blob/master/LICENSE.txt).

## Testing

- `java-shim`: `java-shim/test/com/pkrandomizerweb/RoundTripCheck.java` reads
  a `.rnqs` file back via the real `Settings.read()` and prints the fields —
  the main correctness check for the schema/shim mapping, no ROM required.
  Manually verified end-to-end against the vendored v4.6.1 jar (booleans,
  plain enums, one-hot varargs enums, the GenRestrictions bitmask, and the
  MiscTweaks bitmask all round-tripped correctly). Not yet wired into an
  automated CI run — see follow-ups below.
- `api`/`worker`: unit tests with the Java subprocess mocked.
- **True end-to-end randomization is not run in CI** — we cannot ship
  copyrighted ROM fixtures. Verify manually against your own legally-owned
  ROM before each release.

## Known follow-ups

- Per-field default values: the schema captures each field's *type*, but
  not Settings' own default value for fields the user never touches — the
  shim currently falls back to a type-appropriate zero value (`false` / `0`
  / first enum constant). Extracting real defaults from `Settings.java`'s
  field initializers would make untouched fields match the desktop GUI's
  defaults exactly.
- Misc tweak display names/tooltips live in a `.properties` resource bundle
  not yet fetched — the frontend currently shows raw enum constant names
  (e.g. `BW_EXP_PATCH`) instead of friendly labels.
- A few fields' GUI tab grouping is best-effort (noted individually in
  `settings-schema.json`, e.g. `evosAllowAltFormes`,
  `limitMainGameLegendaries`) — verify against the live desktop GUI if exact
  tab placement matters.
- The round-trip check (see Testing above) isn't wired into an automated
  test runner/CI yet — currently a manual `javac`/`java` invocation.
- Rate limiting is in-memory (single API instance only) — swap for a
  Redis-backed store before running multiple API replicas.
- `vite`/`vitest` dev-dependencies currently carry known advisories
  (path traversal in `vite dev`'s optimized-deps handling, an arbitrary
  file read in vitest's UI server) — both are dev-tooling-only, not shipped
  in the production build, but worth bumping past when a non-major fix
  lands upstream.
- No automated tests written yet for `api`/`worker`/`web` beyond the manual
  build/typecheck/shim verification done during initial scaffolding.
