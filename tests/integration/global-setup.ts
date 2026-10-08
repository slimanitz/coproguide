import postgres from "postgres";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../src/lib/db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string | null;
  }
}

/** Derives a dedicated test database from DATABASE_URL so the demo data is never touched. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? "postgres://coproguide:coproguide@localhost:5438/coproguide");
  url.pathname = "/coproguide_test";
  return url.toString();
}

export default async function setup(project: TestProject) {
  const url = testDatabaseUrl();
  const admin = new URL(url);
  const dbName = admin.pathname.slice(1);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    const [exists] = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (!exists) await sql.unsafe(`CREATE DATABASE "${dbName}"`);
  } catch (error) {
    console.warn(`\n[integration] PostgreSQL unreachable (${(error as Error).message}); integration tests are skipped. Start it with: docker compose up -d db\n`);
    project.provide("testDatabaseUrl", null);
    return;
  } finally {
    await sql.end({ timeout: 2 });
  }
  await runMigrations(url);
  project.provide("testDatabaseUrl", url);
}
