-- CreateTable
CREATE TABLE "login_tentativas" (
    "chave" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "login_tentativas_pkey" PRIMARY KEY ("chave")
);
