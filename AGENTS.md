# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **Discord bot** (TypeScript + Discord.js, SQLite via Drizzle ORM). It runs directly from TypeScript with no compile step thanks to `@swc-node/register/esm`. Standard scripts live in `package.json`; setup/run details are in `README-dev.md`.

### Setup / dependencies
- Dependencies install via `npm ci` (the startup update script handles this). The native module `better-sqlite3` and the `@swc-node` loader must build successfully — they do on the default VM toolchain.

### Common commands
- Lint: `npm run lint:check` (use `npm run lint` to auto-fix).
- Typecheck: `npm run typecheck`.
- Tests: `npm test` (vitest, `--passWithNoTests`).
- Run the bot: `npm start`.

### Running the bot (non-obvious caveats)
- `npm start` requires real Discord credentials in `.env`: `TOKEN` and `CLIENT_ID`. Without them the bot throws `Required environment variable ... not set` at login. These are user-provided secrets; a live bot also needs a Discord application + a test server it has been invited to.
- The database is local SQLite at `data/main.sqlite` (gitignored). It is created automatically and **pending Drizzle migrations are auto-applied on startup** (`src/db/db.ts`). Do not run drizzle migrate manually unless authoring a new migration (`npx drizzle-kit generate`).
- The data layer (Drizzle + `better-sqlite3` + migrations) can be exercised without Discord credentials by importing `src/db/db.ts` / `src/db/schema.ts` and running queries under the same loader (`node --loader @swc-node/register/esm --env-file .env <file>.ts`). This is the core queue/event domain model.
- `better-sqlite3` is opened with `.defaultSafeIntegers()`, so integer columns are returned/bound as `bigint` — use `BigInt(...)` for integer values when writing ad-hoc scripts.
