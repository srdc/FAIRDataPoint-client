# FDP client E2E tests

Playwright tests that drive the STAGE FAIR Data Point client in a real browser: logging in, the
SHACL forms, Turtle and Excel imports, publishing, search, deleting, and the admin pages. Every
run creates its own uniquely named metadata (`E2E test … <run id>`) and deletes it again.

## Run

From Git Bash, in this folder:

```bash
./run.sh                 # everything, against the local stage-fdp-ext stack (http://localhost:8088)
./run.sh flow --headed   # one suite, with the browser visible
./run.sh --report        # open the HTML report (screenshots, video and trace of each failure)
```

After every run:

- `reports/summary.md`: each test with PASS/FAIL/SKIP, and for every failure the error, the browser log
  of that test (pages visited, failed and saving requests with the FDP's answer, console errors) and
  the paths of its screenshot, video and trace
- `reports/latest.log`: the full console output (a timestamped copy of both is kept in `reports/logs/`)
- `reports/results.json`, `reports/html/`: Playwright's own JSON and HTML reports

On the first run `run.sh` finds Node (PATH, IntelliJ's copy, nvm), installs `@playwright/test` and
Chromium, and asks for the password. Put settings you reuse in `.env` (see `.env.example`).

| Suite | What it covers |
|---|---|
| `smoke` | home page, login guard, wrong password, RDF download buttons, catalog page, search, dashboard |
| `root` | root edit form (no blank tabs) and saving it unchanged |
| `flow` | catalog form (empty submit rejected, create, edit draft) → dataset Turtle import with preview → CSVW import (direct publish, variable table) → publish → edit published dataset → search → settings → distribution form → delete everything through the UI |
| `admin` | create/remove a user, generate/remove an API key, schemas, resource definitions, settings, profile |
| `excel` | Excel/CSV import through the extractor; skipped unless `--excel FILE` is given |
| `cleanup` | deletes whatever an interrupted run left behind (runs automatically at the end) |

## Options

| `run.sh` option | Variable | Default |
|---|---|---|
| `--url` | `FDP_UI_URL` | `http://localhost:8088` |
| `--api` | `FDP_API_URL` | `<url>/stage-fdp-api` |
| `--user` | `FDP_USER` | `admin@example.com` (must be an ADMIN: deleting is admin-only) |
| | `FDP_PASSWORD` | asked for |
| `--excel FILE` | `FDP_EXCEL_FILE` | none |
| `--excel-mode` | `FDP_EXCEL_MODE` | `standard` (`kora`, `nfbc` for CSVW dictionaries) |
| `--excel-entity` | `FDP_EXCEL_ENTITY` | `dataset` (`csvw`) |
| `--keep` | `FDP_CLEANUP=0` | entities are deleted |
| `--no-root-save` | `FDP_ROOT_SAVE=0` | root is saved unchanged |
| `--headed`, `--slow MS` | `HEADED`, `SLOWMO` | headless |

Anything after the options goes to Playwright, e.g. `./run.sh flow -g "dataset"`.

Kroniq example (only with an account you may create and delete with):

```bash
./run.sh smoke --url https://kroniq.srdc.com.tr/stage-fdp --api https://kroniq.srdc.com.tr/stage-fdp-api --user technical@srdc.com.tr
```

## Layout

```
run.sh                 the one entry point
playwright.config.ts   suites (projects), timeouts, reports
support/               env (settings), api (REST helper + cleanup registry), ui (form/page helpers),
                       data (names, fixture filling), state (ids passed between flow steps), test (fixtures)
tests/                 auth.setup, smoke, root, flow, admin, excel, cleanup.teardown
fixtures/              Turtle templates for the imports; {{PLACEHOLDERS}} are filled per run
```

Form fields are found by their label (the `sh:name` from the SHACL), so a renamed property in the
schema needs the matching label changed in `tests/flow.spec.ts`.
