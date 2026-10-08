-- AlterTable
ALTER TABLE "proposicoes" ADD COLUMN     "busca" TEXT;

-- CreateIndex
CREATE INDEX "idx_proposicoes_busca_trgm" ON "proposicoes" USING GIN ("busca" gin_trgm_ops);
