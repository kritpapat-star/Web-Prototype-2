-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CEO', 'ENGINEER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_plans" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "actStart" TIMESTAMP(3),
    "actEnd" TIMESTAMP(3),
    "delayStartReason" TEXT,
    "delayEndReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "work_plans_userId_startDate_idx" ON "work_plans"("userId", "startDate");

-- CreateIndex
CREATE INDEX "work_plans_startDate_endDate_idx" ON "work_plans"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
