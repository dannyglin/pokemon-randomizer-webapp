# Pokemon Randomizer Web App — Design Spec

Date: 2026-07-20
Status: Approved for implementation

## 1. Summary

A public website that wraps [Ajarmar/universal-pokemon-randomizer-zx](https://github.com/Ajarmar/universal-pokemon-randomizer-zx)
(a Java Swing desktop app, GPL-3.0) so users can upload their own legally-owned
Pokemon ROM, configure randomization options in a web form with **full parity**
to the desktop app's settings (all generations, Gen 1–7 including 3DS titles),
and download a randomized ROM.

We do not fork or rebuild the randomizer's core logic. We drive the official,
unmodified release jar via its existing headless CLI mode
(`java -jar PokeRandoZX.jar cli -s <settings> -i <input> -o <output> ...`,
see `CliRandomizer.java`), and generate the binary settings file it expects
using the real `Settings` class (via a thin Java shim we write), rather than
reimplementing its bit-packed/CRC-checked format ourselves.

## 2. Non-goals

- We do not extract 3DS ROMs from cartridges/carts or provide that tooling —
  users bring their own already-extracted, zipped ROM folder (the same
  precondition the desktop app has).
- We do not host, distribute, or catalog any game ROMs. Every file is
  user-supplied and ephemeral (see §6).
- We do not build user accounts / auth in v1. Jobs are anonymous and
  addressed by an unguessable link.
- We do not reimplement or modify randomizer logic — all game-data
  transformation happens inside the vendored, unmodified official jar.

## 3. Architecture

Monorepo, npm workspaces:

```
apps/web      React + TypeScript frontend
apps/api      Node/Express + TypeScript — uploads, job creation, status, downloads
apps/worker   Node + TypeScript — BullMQ consumer, shells out to Java
java-shim     Small Java helper compiled against the vendored official jar
infra/        Dockerfiles, docker-compose.yml
```

Redis backs a BullMQ queue. A shared volume (`/data/jobs/<jobId>/`) holds
uploads, generated settings files, and output ROMs — mounted into both `api`
(writes uploads, serves downloads) and `worker` (reads/writes during
processing).

**Flow:**
1. Frontend renders the settings form (schema-driven, see §4) + file
   upload(s). User submits.
2. `api` validates the upload (size limit, extension + magic-byte check),
   writes it to the job's directory, creates a job record (Redis, TTL'd),
   enqueues it in BullMQ, and returns a job ID + status/download URL.
3. `worker` picks up the job:
   a. If a 3DS zipped ROM folder was submitted, unzip it.
   b. Run the Java shim: `settings.json` → `settings.rnqs` (binary, via the
      real `Settings.write()`).
   c. Run `java -Xmx4096M -jar PokeRandoZX.jar cli -s settings.rnqs -i <input> -o <output> [-d] [-u <update>] -l`
      with a hard timeout (default 15 min).
   d. On success: mark job `complete`, record output + log paths. On
      failure/timeout: mark job `failed` with the captured stderr/log
      excerpt.
4. Frontend polls `GET /api/jobs/:id` until terminal state, then shows a
   download link for the ROM (+ log).
5. A scheduled sweep (worker cron, every 30 min) deletes any job directory
   and record older than the retention TTL (default 24h), regardless of
   download status.

Async/queued rather than synchronous request-response because these are real
multi-minute Java subprocesses (3DS titles are recommended 4GB heap) — worker
concurrency is capped (default 2, configurable) and excess jobs queue with a
visible position.

## 4. Settings: schema-driven, not hand-transcribed

`Settings.java` in the target repo exposes **144 public setters** across ~20
enums (types, abilities, starters, trainers, wild encounters, TMs, move
tutors, evolutions, in-game trades, field/shop items, misc tweaks, etc.) —
this is the full surface the desktop GUI exposes across its tabs, and "full
parity" means the web form must cover all of it.

Hand-transcribing 144 fields into both a React form and a Java mapping layer
is error-prone and hard to keep in sync. Instead:

1. **Extract once**: parse `Settings.java` (pinned to the vendored jar's exact
   source tag, e.g. `v4.6.1`) into a single `settings-schema.json` — one
   entry per setter: field name, Java type (`boolean` / `int` / enum name /
   `GenRestrictions` / bitmask), enum values where applicable, and the GUI
   tab it belongs to (for grouping). This file is the single source of
   truth, committed to the repo, regenerated only when we bump the vendored
   randomizer version.
2. **Frontend**: a *generic* schema-driven form renderer (checkboxes for
   booleans, radio/select for enums, grouped into collapsible sections per
   tab) — not 144 hand-written components. Adding/removing a field later is
   a schema edit, not a UI rewrite.
3. **Java shim** (`java-shim/SettingsBuilder.java`): reads a JSON payload
   shaped by the schema, calls the corresponding real `Settings` setters
   explicitly (not reflection — enum coercion, the `GenRestrictions` object,
   and the misc-tweaks bitmask need real type handling), then
   `settings.write(FileOutputStream)`. Compiled at Docker build time against
   the vendored jar: `javac -cp PokeRandoZX.jar -d out SettingsBuilder.java`.
4. A **Settings round-trip test** (write via the shim, read back via
   `Settings.read()`, compare) verifies the mapping without needing a real
   game ROM — this can run in CI.

The vendored jar itself is **not committed to this repo**. The Docker build
downloads the official release zip from GitHub Releases
(`Ajarmar/universal-pokemon-randomizer-zx`, pinned tag) and verifies its
checksum, per GPL-3.0 redistribution terms (we credit and link upstream in
the README/footer).

## 5. Game generation support

- **Handheld (Gen 1–5)**: single-file ROM upload (`.gb/.gbc/.gba/.nds`).
- **3DS (Gen 6/7)**: the randomizer needs an already-extracted ROM
  *directory*. User uploads a `.zip` of that directory; the worker unzips it
  and invokes the CLI with `-d`. An optional separate update file
  (`.cia`, via `-u`) is a second upload field, show only for 3DS titles.
  The UI explains this precondition (extraction is out of scope — same as
  the desktop app).
- File size limits differ by tier: handheld ROMs are small (default cap
  64MB); 3DS zips can be large (default cap 1GB, configurable via env).

## 6. Storage, privacy, and legal guardrails

Hosting a public service that accepts arbitrary user ROM uploads carries real
legal/abuse considerations even though no game data is ever distributed by
us. Guardrails:

- **Ephemeral only**: no ROM library, no catalog, no cross-user visibility.
  Each job lives at an unguessable UUID path; only someone with the job
  link can see or download it.
- **Retention TTL** (default 24h) enforced by a scheduled sweep — files and
  job metadata are deleted regardless of whether they were downloaded.
- **Upload validation**: extension allowlist + magic-byte sniffing to reject
  non-ROM files (reduces arbitrary-file-processing abuse surface); size caps
  enforced server-side, not just client-side.
- **Rate limiting**: per-IP job creation limit (default 5/hour), backed by
  Redis, to bound cost and abuse.
- **Process isolation**: the Java subprocess runs with a wall-clock timeout
  (default 15 min, kill on expiry), no network access needed/granted, and
  the worker container runs as a non-root user.
- **Terms of Service / disclaimer**: a required checkbox on submission
  affirming the user owns a legal copy of the game being uploaded; footer
  states the site stores no game data long-term and links the upstream
  project + its GPL-3.0 license.

## 7. Deployment

Docker Compose, four services:

- `web` — nginx serving the built React static bundle, reverse-proxies
  `/api/*` to `api`.
- `api` — Node/Express.
- `worker` — Node + JDK (for the vendored jar + shim), consumes the BullMQ
  queue, mounts `job-data` volume.
- `redis` — queue + job status + rate-limit counters.

All tunables (upload size caps, retention TTL, worker concurrency, rate
limits, vendored randomizer version/checksum) are environment-driven
(`.env`), documented in the README.

## 8. Testing strategy

- **Settings shim**: round-trip test (write → read via the real `Settings`
  class) — runs in CI, no ROM needed.
- **API/worker**: unit tests for validation, job lifecycle, and TTL sweep
  logic with the Java subprocess mocked.
- **Frontend**: component tests for the generic schema-driven form renderer
  (rendering/validation logic, not one test per field) and the upload/job
  status flow.
- **True end-to-end randomization** (CLI actually producing a valid
  randomized ROM) is **not run in CI** — we cannot ship copyrighted ROM
  fixtures. This is verified manually by the developer against their own
  legally-owned ROMs before each release, documented in the README as a
  manual pre-release checklist.

## 9. Implementation phases

Given the scope (144-field parity, all generations, public hosting), the
build proceeds in phases within this one design:

1. **Core pipeline, handheld gens, schema extraction**: monorepo scaffold,
   `settings-schema.json` extraction, generic form renderer, upload → job →
   shim → CLI → download working end-to-end for Gen 1–5 ROMs.
2. **3DS support**: zip/folder upload, update-file flow, `-d`/`-u` wiring,
   larger-file handling.
3. **Public-launch hardening**: rate limiting, TTL sweep, ToS gate, upload
   validation hardening, Docker Compose deployment, load/concurrency
   tuning.
