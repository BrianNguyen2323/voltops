import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof openDb>;
const g = globalThis as unknown as { __voltopsDb?: Db };

// Lazy so importing this module never opens a file (tests, next build).
const get = () =>
  (g.__voltopsDb ??= openDb(process.env.DATABASE_PATH ?? "./data/voltops.db"));

export const db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(get(), prop) as unknown,
});
