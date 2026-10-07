// Roda um comando com um Postgres descartável já migrado.
// Uso: tsx scripts/with-test-db.ts [--cwd <dir>] -- <comando> [args...]
// O comando recebe DATABASE_URL apontando para o banco de teste.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startPg } from "./pg";

const WEB_DIR = path.resolve(__dirname, "..");

function parseArgs(argv: string[]) {
  const sep = argv.indexOf("--");
  const own = sep === -1 ? [] : argv.slice(0, sep);
  const cmd = sep === -1 ? argv : argv.slice(sep + 1);
  const cwdIdx = own.indexOf("--cwd");
  const cwd = cwdIdx === -1 ? WEB_DIR : path.resolve(WEB_DIR, own[cwdIdx + 1]);
  const repoRoot = path.resolve(WEB_DIR, "..");
  if (!cwd.startsWith(repoRoot)) {
    throw new Error(`--cwd fora do repositório: ${cwd}`);
  }
  return { cwd, cmd };
}

function testPort(): number {
  const port = Number(process.env.PG_TEST_PORT ?? 54330);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`PG_TEST_PORT inválida: ${process.env.PG_TEST_PORT}`);
  }
  return port;
}

async function main() {
  const { cwd, cmd } = parseArgs(process.argv.slice(2));
  if (cmd.length === 0) {
    throw new Error("Informe o comando após `--`.");
  }

  const port = testPort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "radarpa-pgtest-"));
  const cleanupDir = () => {
    try {
      // No Windows o postgres pode segurar arquivos por alguns instantes após parar.
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.warn(`Aviso: não foi possível remover ${dataDir}`);
    }
  };

  let pg: Awaited<ReturnType<typeof startPg>>;
  try {
    // Fuso não-UTC de propósito: pega bugs de conversão de timestamptz que o Railway (UTC) esconderia.
    pg = await startPg({
      dataDir,
      port,
      persistent: false,
      quiet: true,
      timezone: "America/Sao_Paulo",
    });
  } catch (err) {
    cleanupDir();
    throw new Error(
      `Não foi possível iniciar o Postgres de teste na porta ${port} ` +
        `(há outro rodando? defina PG_TEST_PORT): ${String(err)}`,
    );
  }

  // Ctrl+C no meio dos testes não deve deixar um postgres órfão.
  const onSignal = async () => {
    await pg.stop().catch(() => {});
    cleanupDir();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  let status = 1;
  try {
    await pg.createDatabase("radarpa_test");
    const env = { ...process.env, DATABASE_URL: pg.url("radarpa_test") };

    const migrate = spawnSync("npx prisma migrate deploy", {
      cwd: WEB_DIR,
      env,
      stdio: "inherit",
      shell: true,
    });
    if (migrate.status !== 0) {
      throw new Error("prisma migrate deploy falhou");
    }

    // O comando vem do package.json (fonte confiável), então concatenar é seguro.
    const run = spawnSync(cmd.join(" "), { cwd, env, stdio: "inherit", shell: true });
    status = run.status ?? 1;
  } finally {
    await pg.stop();
    cleanupDir();
  }
  process.exit(status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
