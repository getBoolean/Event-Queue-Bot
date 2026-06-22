import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema.ts";

// Under Vitest, use a throwaway in-memory DB so importing the command/option
// graph (which transitively connects here) never touches the real dev/prod DB.
export const DB_FILEPATH = process.env.VITEST ? ":memory:" : "data/main.sqlite";
export const DB_BACKUP_DIRECTORY = "data/backups";
export const MIGRATIONS_FOLDER = "data/migrations";

function connect() {
	const conn = drizzle(Database(DB_FILEPATH).defaultSafeIntegers(), { schema });
	migrate(conn, { migrationsFolder: MIGRATIONS_FOLDER });
	return conn;
}

export let db = connect();

export namespace Db {
	export function reload() {
		db = connect();
	}

	export function printLoadMessage() {
		console.log(`Loaded ${Object.keys(db._.schema).length} tables from database: ${DB_FILEPATH}`);
	}
}