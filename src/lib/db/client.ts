import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

type Holder = { sql?: postgres.Sql; db?: Db; url?: string };
// Survive Next.js hot reloads in dev: keep a single pool per process.
const globalHolder = globalThis as unknown as { __coproguideDb?: Holder };
const holder: Holder = (globalHolder.__coproguideDb ??= {});

export function getDb(url: string = env.databaseUrl): Db {
  if (holder.db && holder.url === url) return holder.db;
  holder.sql = postgres(url, { max: 10, onnotice: () => undefined });
  holder.db = drizzle(holder.sql, { schema });
  holder.url = url;
  return holder.db;
}

export async function closeDb(): Promise<void> {
  if (holder.sql) await holder.sql.end({ timeout: 5 });
  holder.sql = undefined;
  holder.db = undefined;
  holder.url = undefined;
}

export { schema };
