-- Busca textual (trigram) usada pelos índices GIN abaixo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "legislaturas" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "legislaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vereadores" (
    "id" SERIAL NOT NULL,
    "gwlegis_id" INTEGER,
    "nome" TEXT NOT NULL,
    "nome_parlamentar" TEXT NOT NULL,
    "partido" TEXT NOT NULL,
    "foto_url" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "legislatura_id" INTEGER,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vereadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesa_diretora" (
    "id" SERIAL NOT NULL,
    "vereador_id" INTEGER NOT NULL,
    "cargo" TEXT NOT NULL,
    "legislatura_id" INTEGER,
    "inicio" DATE,
    "fim" DATE,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mesa_diretora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissoes" (
    "id" SERIAL NOT NULL,
    "gwlegis_id" INTEGER,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'permanente',
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissao_membros" (
    "id" SERIAL NOT NULL,
    "comissao_id" INTEGER NOT NULL,
    "vereador_id" INTEGER NOT NULL,
    "cargo" TEXT NOT NULL DEFAULT 'membro',
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissao_membros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" SERIAL NOT NULL,
    "gwlegis_id" INTEGER,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "data_inicio" TIMESTAMPTZ NOT NULL,
    "data_fim" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'Encerrada',
    "titulo" TEXT,
    "pauta_url" TEXT,
    "ata_url" TEXT,
    "video_url" TEXT,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessao_presencas" (
    "id" SERIAL NOT NULL,
    "sessao_id" INTEGER NOT NULL,
    "vereador_id" INTEGER NOT NULL,
    "presente" BOOLEAN NOT NULL DEFAULT true,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessao_presencas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposicoes" (
    "id" SERIAL NOT NULL,
    "gwlegis_id" INTEGER,
    "tipo" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "titulo" TEXT,
    "ementa" TEXT,
    "status" TEXT,
    "data_protocolo" DATE,
    "link" TEXT,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposicao_autores" (
    "id" SERIAL NOT NULL,
    "proposicao_id" INTEGER NOT NULL,
    "vereador_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'autor',

    CONSTRAINT "proposicao_autores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votacoes" (
    "id" SERIAL NOT NULL,
    "sessao_id" INTEGER NOT NULL,
    "proposicao_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "resultado" TEXT,
    "tipo_votacao" TEXT,
    "data" TIMESTAMPTZ,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votos" (
    "id" SERIAL NOT NULL,
    "votacao_id" INTEGER NOT NULL,
    "vereador_id" INTEGER NOT NULL,
    "voto" TEXT NOT NULL,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "noticias" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "data_publicacao" TIMESTAMPTZ,
    "resumo" TEXT,
    "fonte_url" TEXT NOT NULL,
    "coletado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "noticias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_pessoais" (
    "id" SERIAL NOT NULL,
    "tipo_alvo" TEXT NOT NULL,
    "alvo_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_pessoais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coleta_logs" (
    "id" SERIAL NOT NULL,
    "coletor" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ,
    "status" TEXT NOT NULL,
    "registros" INTEGER NOT NULL DEFAULT 0,
    "detalhes" TEXT,
    "erro" TEXT,

    CONSTRAINT "coleta_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fontes" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "data_coleta" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT,
    "tabela_destino" TEXT,
    "registro_id" INTEGER,

    CONSTRAINT "fontes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legislaturas_numero_key" ON "legislaturas"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "vereadores_gwlegis_id_key" ON "vereadores"("gwlegis_id");

-- CreateIndex
CREATE UNIQUE INDEX "mesa_diretora_vereador_id_cargo_legislatura_id_key" ON "mesa_diretora"("vereador_id", "cargo", "legislatura_id");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_gwlegis_id_key" ON "comissoes"("gwlegis_id");

-- CreateIndex
CREATE UNIQUE INDEX "comissao_membros_comissao_id_vereador_id_key" ON "comissao_membros"("comissao_id", "vereador_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_gwlegis_id_key" ON "sessoes"("gwlegis_id");

-- CreateIndex
CREATE INDEX "idx_sessoes_data" ON "sessoes"("data_inicio" DESC);

-- CreateIndex
CREATE INDEX "idx_sessoes_titulo_trgm" ON "sessoes" USING GIN ("titulo" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_numero_tipo_ano_key" ON "sessoes"("numero", "tipo", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_presencas_sessao_id_vereador_id_key" ON "sessao_presencas"("sessao_id", "vereador_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposicoes_gwlegis_id_key" ON "proposicoes"("gwlegis_id");

-- CreateIndex
CREATE INDEX "idx_proposicoes_tipo_ano" ON "proposicoes"("tipo", "ano");

-- CreateIndex
CREATE INDEX "idx_proposicoes_ementa_trgm" ON "proposicoes" USING GIN ("ementa" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_proposicoes_titulo_trgm" ON "proposicoes" USING GIN ("titulo" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "proposicoes_tipo_numero_ano_titulo_key" ON "proposicoes"("tipo", "numero", "ano", "titulo");

-- CreateIndex
CREATE UNIQUE INDEX "proposicao_autores_proposicao_id_vereador_id_tipo_key" ON "proposicao_autores"("proposicao_id", "vereador_id", "tipo");

-- CreateIndex
CREATE INDEX "idx_votacoes_sessao" ON "votacoes"("sessao_id");

-- CreateIndex
CREATE UNIQUE INDEX "votacoes_sessao_id_descricao_key" ON "votacoes"("sessao_id", "descricao");

-- CreateIndex
CREATE INDEX "idx_votos_vereador" ON "votos"("vereador_id");

-- CreateIndex
CREATE UNIQUE INDEX "votos_votacao_id_vereador_id_key" ON "votos"("votacao_id", "vereador_id");

-- CreateIndex
CREATE UNIQUE INDEX "noticias_url_key" ON "noticias"("url");

-- CreateIndex
CREATE INDEX "idx_notas_alvo" ON "notas_pessoais"("tipo_alvo", "alvo_id");

-- AddForeignKey
ALTER TABLE "vereadores" ADD CONSTRAINT "vereadores_legislatura_id_fkey" FOREIGN KEY ("legislatura_id") REFERENCES "legislaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesa_diretora" ADD CONSTRAINT "mesa_diretora_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesa_diretora" ADD CONSTRAINT "mesa_diretora_legislatura_id_fkey" FOREIGN KEY ("legislatura_id") REFERENCES "legislaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_membros" ADD CONSTRAINT "comissao_membros_comissao_id_fkey" FOREIGN KEY ("comissao_id") REFERENCES "comissoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_membros" ADD CONSTRAINT "comissao_membros_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_presencas" ADD CONSTRAINT "sessao_presencas_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao_presencas" ADD CONSTRAINT "sessao_presencas_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposicao_autores" ADD CONSTRAINT "proposicao_autores_proposicao_id_fkey" FOREIGN KEY ("proposicao_id") REFERENCES "proposicoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposicao_autores" ADD CONSTRAINT "proposicao_autores_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votacoes" ADD CONSTRAINT "votacoes_sessao_id_fkey" FOREIGN KEY ("sessao_id") REFERENCES "sessoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votacoes" ADD CONSTRAINT "votacoes_proposicao_id_fkey" FOREIGN KEY ("proposicao_id") REFERENCES "proposicoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votos" ADD CONSTRAINT "votos_votacao_id_fkey" FOREIGN KEY ("votacao_id") REFERENCES "votacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votos" ADD CONSTRAINT "votos_vereador_id_fkey" FOREIGN KEY ("vereador_id") REFERENCES "vereadores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
