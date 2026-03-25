-- CreateTable
CREATE TABLE "SarsDailyJobLease" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SarsDailyJobLease_pkey" PRIMARY KEY ("id")
);
