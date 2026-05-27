<!-- OCR:START -->
## Open Code Review Instructions

These instructions are for AI assistants handling code review in this project.

Always open `.ocr/skills/SKILL.md` when the request:
- Asks for code review, PR review, or feedback on changes
- Mentions "review my code" or similar phrases
- Wants multi-perspective analysis of code quality
- Asks to map, organize, or navigate a large changeset

Use `.ocr/skills/SKILL.md` to learn:
- How to run the 8-phase review workflow
- How to generate a Code Review Map for large changesets
- Available reviewer personas and their focus areas
- Session management and output format

Keep this managed block so `ocr init` can refresh the instructions.

<!-- OCR:END -->

# LedgerMitra — Agent Guide

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (electron-vite with HMR) |
| `npm run build` | Build all three targets (main + preload + renderer) |
| `npm run package:win` | Package NSIS installer into `release/` |
| `node scripts/accounting-test.mjs` | Manual integration test (double-entry, GST, balances) |

**Install:** `npm install --legacy-peer-deps` then `npm run rebuild:native` (rebuilds better-sqlite3 + mdb-reader for Electron). `postinstall` does both automatically.

**No linter, formatter, typecheck script, or CI.** Edit with discipline.

## Architecture

- **Electron app** with 3 build targets (`electron.vite.config.ts`):
  - `main` — entry `src/main/main.ts` → `dist/main/`
  - `preload` — entry `src/main/preload.ts` → `dist/preload/`
  - `renderer` — entry `src/renderer/index.html` → `dist/renderer/`
- **No react-router.** Screen transitions via `useState<Screen>` in `src/renderer/App.tsx`: `login → company → fy → app`
- **IPC pattern:** IPC channel strings in `src/shared/constants.ts` → `contextBridge` exposure in `preload.ts` → `ipcMain.handle` in `ipc-handlers.ts`
- **Path aliases:** `@main/*`, `@renderer/*`, `@shared/*` resolve to `src/*`
- **Database** (`better-sqlite3`): synchronous, WAL mode, raw SQL via queryAll/queryOne/executeWrite helpers in `database.ts`. Schema + migrations run at startup on every launch.
- **Renamed from FinBook Pro** — all env vars use `LEDGERMITRA_` prefix, DB file is `ledgermitra.db`

## Key details

- Default login: `admin` / `admin123` (seeded in `database.ts`)
- Legacy import password: `allthebest` (constant in `constants.ts`)
- `start.bat` sets `LEDGERMITRA_LEGACY_DATA` and runs `npm run dev`
- `mdb-reader` is a native module — excluded from `externalizeDepsPlugin` in vite config
- Schema has 17 tables (17 `CREATE TABLE`), migrations are additive via `PRAGMA table_info()` checks
- Legacy MDB import engine is in `src/main/mdb-import.ts` (~2300 lines, the largest file)
- All user-facing strings use `APP_NAME` from `src/shared/constants.ts`
