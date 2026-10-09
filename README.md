# Radar PA

PWA pessoal (usuário único) para acompanhar a **Câmara Municipal de Pouso Alegre (MG)**:
sessões plenárias, votações nominais, presença, vereadores, comissões, proposições,
notícias e notas pessoais — com busca sem acento e tema claro/escuro.

Os dados vêm de fontes públicas oficiais: o portal **GWLegis** da Câmara
(`cmpousoalegre.gwlegis.com.br`) e o RSS do site institucional
(`www.pousoalegre.mg.leg.br`).

## Arquitetura

```
RadarPA/
├── web/          Next.js 16 (App Router, Cache Components) + Prisma 7 + Tailwind 4
│                 páginas, API (/api/*), autenticação, PWA
└── collectors/   Python 3.12: coletores que gravam direto no Postgres (SQL)
```

- **Banco:** PostgreSQL (com `pg_trgm`). O schema e as migrations ficam em
  `web/prisma/`; os coletores usam os mesmos nomes de tabela/coluna (snake_case).
- **Coletores** (`collectors/run_all.py`, um após o outro; falha de um não para os demais):

  | Coletor | Fonte | O que grava |
  |---|---|---|
  | `collector_vereadores` | HTML `/vereadores`, perfis, `/comissoes` | vereadores, Mesa, comissões, legislatura |
  | `collector_sessoes` | export CSV + listagem HTML | sessões (desde 2000) e o id interno de cada uma |
  | `collector_votacoes` | boletins CSV de votação e presença | votações, votos nominais, presença (só 2026+) |
  | `collector_proposicoes` | export CSV + listagem por autor | ~60 mil proposições, autoria, ligação com votações |
  | `collector_noticias` | RSS do site da Câmara | notícias do Dashboard |

  Toda execução fica em `coleta_logs` (sucesso / parcial / erro / interrompido) e o
  Dashboard avisa quando a última coleta de algum coletor falhou.
- **Boas práticas de coleta:** user-agent identificado (`RadarPA/1.0 (+uso-pessoal)`),
  1 requisição por segundo, retry com backoff (respeita `Retry-After`) e só os dois
  hosts acima (inclusive em redirects).

## Rodando localmente

Pré-requisitos: Node 24 e Python 3.12. Não precisa instalar PostgreSQL: em dev e nos
testes é usado um Postgres embutido (`embedded-postgres`).

```bash
# 1. Dependências
cd web && npm install
cd ../collectors && python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt   # Linux/mac: .venv/bin/pip

# 2. Configuração
cp web/.env.example web/.env   # preencha ADMIN_PASSWORD (12+) e JWT_SECRET (32+)

# 3. Banco de dev (deixe rodando em um terminal; dados em web/.pgdata)
cd web && npm run db:start

# 4. Em outro terminal: schema e dados
cd web && npx prisma migrate deploy
cd ../collectors && .venv/Scripts/python run_all.py   # 1ª vez demora (~30 min: backfill de ids e autoria)

# 5. App
cd web && npm run dev   # http://localhost:3000
```

Coletores podem rodar isolados: `python collector_sessoes.py`, `python collector_proposicoes.py --completo`, etc.

## Testes

```bash
cd web
npm test            # Vitest: unitários + testes com banco (sobe um Postgres descartável)
npm run test:unit   # só os unitários, sem banco
npm run test:py     # pytest dos coletores, com o mesmo Postgres descartável
npm run typecheck && npm run lint
```

O Postgres de teste sobe no fuso `America/Sao_Paulo` de propósito, para pegar bugs de
data/hora que um servidor em UTC esconderia. Os testes dos coletores usam fixtures
reais recortadas (`collectors/tests/fixtures/`) e não acessam a internet.

## Deploy (gratuito): Vercel + Neon + coleta no PC de casa

| Peça | Onde | Plano |
|---|---|---|
| App (`web/`) | Vercel, região `gru1` (São Paulo), fixada em `web/vercel.json` | Hobby |
| Postgres | Neon, região **AWS São Paulo** (`aws-sa-east-1`) | Free (0,5 GB; o banco tem ~160 MB) |
| Coletores | Agendador de Tarefas do Windows, no PC de casa, todo dia às 06:00 | grátis |

Os coletores **não** rodam na nuvem: o portal GWLegis fica atrás do Cloudflare e responde
403 a acessos vindos de datacenters (GitHub Actions, Vercel). Do PC de casa funciona.

**Passo a passo (uma vez):**

1. **GitHub:** crie um repositório (pode ser privado) e envie este código.
2. **Vercel → Add New → Project:** importe o repositório e defina **Root Directory = `web`**.
   O resto (framework Next.js, comando de build, região) já vem de `web/vercel.json`.
3. **Vercel → Storage → Create Database → Neon:** escolha a região **São Paulo** e
   conecte ao projeto. A integração cria `DATABASE_URL` (pooler) e
   `DATABASE_URL_UNPOOLED` (direta). O app usa a **direta** (`web/src/lib/database-url.ts`):
   o pooler do Neon roda em modo transação e descarta parâmetros de sessão (o
   `TimeZone=UTC` do `lib/db.ts`), além de não servir para migrations.
4. **Vercel → Settings → Environment Variables** (ambiente Production):

   | Variável | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | senha de acesso, 12+ caracteres |
   | `JWT_SECRET` | 32+ caracteres aleatórios: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

5. **Redeploy** na Vercel. Em produção o build roda `prisma migrate deploy` antes do
   `next build` (falhou → o deploy não sobe). Previews não migram o banco.
6. **Coleta no PC (Windows):** crie `collectors/.env.producao` (fica fora do git) com
   `DATABASE_URL=` + a string **direta** do Neon (o valor de `DATABASE_URL_UNPOOLED`; o
   host não tem `-pooler`). Depois registre a tarefa (PowerShell):

   ```powershell
   $acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "D:\Programas\RadarPA\collectors\coletar-producao.ps1"' -WorkingDirectory "D:\Programas\RadarPA\collectors"
   $gatilho = New-ScheduledTaskTrigger -Daily -At 6:00
   $config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew -RunOnlyIfNetworkAvailable
   Register-ScheduledTask -TaskName "RadarPA - Coletores" -Action $acao -Trigger $gatilho -Settings $config
   ```

   `-StartWhenAvailable`: se o PC estiver desligado às 06:00, a coleta roda assim que
   ele for ligado. Logs em `collectors/logs/` (os 60 mais recentes).
7. **Primeira carga:** `Start-ScheduledTask -TaskName "RadarPA - Coletores"`. Leva
   ~30 min (backfill dos ids das sessões e da autoria); as execuções diárias, poucos
   minutos.

No celular: abra a URL `*.vercel.app`, entre e use "Adicionar à tela inicial" para
instalar o PWA.

Trocar `ADMIN_PASSWORD` derruba todas as sessões abertas. Se uma coleta falhar, o
Dashboard mostra o aviso (detalhes no log em `collectors/logs/`).

**Notas de operação:**
- O rate limit do login fica no banco (`login_tentativas`), porque na Vercel cada
  instância teria o próprio contador. O IP vem de `X-Real-IP`, que a Vercel preenche
  (e ela sobrescreve o `X-Forwarded-For` enviado pelo cliente).
- O Neon free suspende o banco após 5 min sem uso; o primeiro acesso depois disso
  demora ~1 s a mais.
- Não configure `serverActions.allowedOrigins`: o padrão (Origin precisa bater com o
  Host) é o mais restrito e funciona na Vercel.

## Segurança e privacidade

- Login só com senha (usuário único); sessão JWT HS256 de 7 dias em cookie
  `httpOnly`/`SameSite=Lax` (`__Host-` em produção); rate limit de 5 tentativas/15 min por IP.
- Duas barreiras: `web/src/proxy.ts` e nova verificação perto dos dados (páginas,
  rotas de API e Server Actions).
- Headers de segurança (CSP, HSTS, `X-Frame-Options`, `nosniff`…). O CSP mantém
  `'unsafe-inline'` em scripts: nonce exigiria renderização totalmente dinâmica.
- O service worker **não guarda dados** (só assets estáticos e a página offline):
  depois de "Sair", nada da Câmara fica legível no aparelho; sem rede, o app mostra
  "Sem conexão".

## Particularidades das fontes (para quem for mexer nos coletores)

- **Boletins de votação/presença só existem a partir de 2026**, e o id deles não é o
  id da sessão: o coletor lê os links na página de cada sessão.
- Nos boletins os votos vêm com **nomes abreviados** ("Rogerinho P."), e os do início
  de 2026 usam o **nome civil** ("Rogério A."). O mapeamento fica em
  `collectors/nomes_civis.py` — vereador novo (ex.: suplente) aparece em
  `coleta_logs.detalhes` como "nome não reconhecido" e a sessão é refeita depois que
  ele for acrescentado ali.
- O portal grafa o mesmo documento de dois jeitos ("Substitutivo Nº 1 ao …" vs.
  "Substitutivo Nº 01/2026 ao(à) …"); o casamento usa título normalizado.
- O export de proposições **não traz autoria**: ela vem da listagem filtrada por
  vereador na legislatura atual (incremental no dia a dia, completa aos domingos).
- "Próxima sessão" no Dashboard é **estimada** pelo padrão das ordinárias (terças),
  a menos que exista uma sessão futura cadastrada no portal.
- O `robots.txt` do GWLegis bloqueia robôs genéricos. O projeto usa principalmente
  as exportações públicas (CSV) do próprio portal e raspa HTML com volume mínimo,
  user-agent identificado e 1 req/s, para uso pessoal.
