// Postgres embutido (pacote embedded-postgres) para desenvolvimento e testes,
// já que a máquina de dev não tem Postgres/Docker. Em produção usa-se o Neon.
import EmbeddedPostgres from "embedded-postgres";

export const PG_USER = "radarpa";
export const PG_PASSWORD = "radarpa";

export type StartedPg = {
  url: (database: string) => string;
  createDatabase: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

export async function startPg(opts: {
  dataDir: string;
  port: number;
  persistent: boolean;
  quiet?: boolean;
  timezone?: string;
}): Promise<StartedPg> {
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port: opts.port,
    persistent: opts.persistent,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // Só aceita conexões locais (as credenciais são fixas e só servem para dev/teste).
    postgresFlags: [
      "-c",
      "listen_addresses=127.0.0.1",
      // PG 18 no Windows: io_workers podem sobreviver ao postmaster e segurar a porta.
      "-c",
      "io_method=sync",
      ...(opts.timezone ? ["-c", `timezone=${opts.timezone}`] : []),
    ],
    onLog: opts.quiet ? () => {} : console.log,
  });

  const fs = await import("node:fs");
  if (!fs.existsSync(`${opts.dataDir}/PG_VERSION`)) {
    await pg.initialise();
  }
  await pg.start();

  return {
    url: (database) =>
      `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${opts.port}/${database}`,
    createDatabase: async (name) => {
      const client = pg.getPgClient();
      await client.connect();
      try {
        const exists = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [name],
        );
        if (exists.rowCount === 0) {
          await pg.createDatabase(name);
        }
      } finally {
        await client.end();
      }
    },
    stop: async () => {
      try {
        await pg.stop();
      } catch (err) {
        // Com persistent=false o stop() apaga a pasta de dados depois que o postgres sai;
        // no Windows ela pode seguir travada por instantes (EBUSY). O servidor já parou.
        if ((err as NodeJS.ErrnoException).code !== "EBUSY") throw err;
        console.warn(`Aviso: pasta de dados ainda em uso, não removida (${String(err)})`);
      }
      // pg.stop() resolve antes do postmaster sair; espera a porta liberar
      // para que uma execução seguinte não colida com ela.
      await waitPortFree(opts.port);
    },
  };
}

async function waitPortFree(port: number, timeoutMs = 15000) {
  const net = await import("node:net");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inUse = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (!inUse) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
