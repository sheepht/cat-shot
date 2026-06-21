-- CreateTable
CREATE TABLE "Cat" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "breed" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
);
