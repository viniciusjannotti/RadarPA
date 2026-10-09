# Roda todos os coletores contra o banco de produção (Neon). Chamado pelo Agendador de
# Tarefas do Windows (tarefa "RadarPA - Coletores"; ver README). Roda do PC de casa
# porque o portal GWLegis bloqueia (403) acessos vindos de datacenters.
#
# A string de conexão fica em collectors/.env.producao (fora do git):
#   DATABASE_URL=postgresql://...   (conexão direta do Neon, sem "-pooler")
# Ela tem prioridade sobre o web/.env de dev (load_dotenv não sobrescreve o ambiente).
$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot

$envFile = Join-Path $dir ".env.producao"
$linha = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $linha) { throw "DATABASE_URL não encontrada em $envFile" }
$env:DATABASE_URL = $linha.Substring("DATABASE_URL=".Length).Trim().Trim('"')
$env:PYTHONIOENCODING = "utf-8"

$logs = Join-Path $dir "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs ("coleta-{0:yyyy-MM-dd_HHmm}.log" -f (Get-Date))

# O logging do Python sai no stderr; Start-Process grava cada stream em um arquivo.
$python = Join-Path $dir ".venv\Scripts\python.exe"
$p = Start-Process -FilePath $python -ArgumentList "run_all.py" -WorkingDirectory $dir `
  -RedirectStandardError $log -RedirectStandardOutput "$log.out" `
  -NoNewWindow -Wait -PassThru

# Mantém só os últimos 60 logs.
Get-ChildItem $logs -File | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 120 | Remove-Item -Force

exit $p.ExitCode
