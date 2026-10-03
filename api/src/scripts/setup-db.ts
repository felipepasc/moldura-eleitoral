import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const dbName = url.pathname.slice(1);

  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Nome de banco inválido: ${dbName}`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1 });
  const existing = await admin`select 1 from pg_database where datname = ${dbName}`;

  if (existing.length === 0) {
    await admin.unsafe(`create database "${dbName}"`);
  }

  await admin.end();

  const sql = postgres(url.toString(), { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
