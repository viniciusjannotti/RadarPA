-- AlterTable
ALTER TABLE "sessao_presencas" ADD COLUMN     "situacao" TEXT;

-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "boletins_verificados_em" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "votacoes" ADD COLUMN     "assunto" TEXT,
ADD COLUMN     "autoria" TEXT,
ADD COLUMN     "legenda" TEXT,
ADD COLUMN     "ordem" INTEGER,
ADD COLUMN     "tipo_aprovacao" TEXT;
