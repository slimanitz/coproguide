import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

/** Creates the pgvector extension then applies the Drizzle SQL migrations in ./drizzle. */
export async function runMigrations(url: string, migrationsFolder = path.resolve(process.cwd(), "drizzle")) {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
