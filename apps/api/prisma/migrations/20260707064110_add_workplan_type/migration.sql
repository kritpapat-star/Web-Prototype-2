-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('SOLAR', 'CCTV', 'NETWORK');

-- AlterTable
ALTER TABLE "work_plans" ADD COLUMN     "type" "PlanType";

-- Backfill: tag แผนเดิมจาก prefix ของ jobId (seed เดิมฝังประเภทไว้ใน prefix)
-- แผน jobId ธรรมดา (JOB-001, …) ที่ไม่ตรง prefix → เหลือเป็น NULL ซึ่งถูกต้องตามที่ type เป็น optional
UPDATE "work_plans" SET "type" = 'CCTV'    WHERE "type" IS NULL AND "jobId" LIKE 'JOB-CCTV-%';
UPDATE "work_plans" SET "type" = 'SOLAR'   WHERE "type" IS NULL AND "jobId" LIKE 'JOB-SOLAR-%';
UPDATE "work_plans" SET "type" = 'NETWORK' WHERE "type" IS NULL AND "jobId" LIKE 'JOB-NET-%';

