-- slim tickets — เหลือ 8 column: id, title, detail, status, type, assigneeId, createdById, createdAt
-- (เจ้าของสั่ง 20 ก.ค. 2026 — ยกเลิก lock "ห้ามมี column status" + "ไซต์บังคับ" เฉพาะฝั่ง ticket)
-- backfill status จาก workPlanId/closedAt เดิมก่อน drop เพื่อไม่ให้สถานะใบเดิมหาย
-- ⚠️ destructive: ไซต์/วันนัดลูกค้า/เหตุผลปิดใบ ของใบเดิมหายถาวร

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CLOSED');

-- AddColumn + backfill
ALTER TABLE "tickets" ADD COLUMN "status" "TicketStatus" NOT NULL DEFAULT 'OPEN';
UPDATE "tickets" SET "status" = 'ACCEPTED' WHERE "workPlanId" IS NOT NULL;
UPDATE "tickets" SET "status" = 'CLOSED' WHERE "closedAt" IS NOT NULL AND "workPlanId" IS NULL;

-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_siteId_fkey";
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_workPlanId_fkey";

-- DropIndex
DROP INDEX "tickets_siteId_idx";
DROP INDEX "tickets_workPlanId_key";

-- DropColumn
ALTER TABLE "tickets"
  DROP COLUMN "siteId",
  DROP COLUMN "appointmentAt",
  DROP COLUMN "workPlanId",
  DROP COLUMN "closedAt",
  DROP COLUMN "closeReason",
  DROP COLUMN "updatedAt";
