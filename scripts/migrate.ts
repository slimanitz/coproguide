import { runMigrations } from "../src/lib/db/migrate";
import { env } from "../src/lib/env";

await runMigrations(env.databaseUrl);
console.log("Migrations applied.");
