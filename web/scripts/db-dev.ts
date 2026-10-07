// Sobe o Postgres de desenvolvimento (dados persistem em web/.pgdata).
// Uso: npm run db:start  — deixe rodando em um terminal; Ctrl+C para parar.
import path from "node:path";
import { startPg } from "./pg";

const PORT = Number(process.env.PG_DEV_PORT ?? 54329);
const DB = "radarpa";

async function main() {
  const pg = await startPg({
    dataDir: path.resolve(__dirname, "..", ".pgdata"),
    port: PORT,
    persistent: true,
    quiet: true,
  });
  await pg.createDatabase(DB);
  console.log(`Postgres de dev pronto: ${pg.url(DB)}`);
  console.log("Ctrl+C para parar.");

  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
