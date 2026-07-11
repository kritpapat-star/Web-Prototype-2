-- เปลี่ยน users.id เป็นเลขรัน (11 ก.ค. 2026):
--   users.id  cuid text → INTEGER autoincrement (renumber 1, 2, 3, … ตามลำดับสร้าง)
--   FK ตามไป 2 ที่: work_plans.userId, audit_logs.userId — remap ก่อนสลับ PK
-- ผลข้างเคียง: JWT เก่าที่ sub เป็น cuid ใช้ไม่ได้หลัง migrate (createContext เช็คว่า sub
-- ต้องเป็นเลข) → user ต้อง login ใหม่รอบเดียว (token อายุ 12h อยู่แล้ว)
-- audit_logs.targetId ไม่ต้อง remap — ไม่มี action ไหนเก็บ user id ใน targetId

-- ============ users: renumber ตาม id เดิม ============
-- cuid เรียงตามเวลาสร้าง (มี timestamp นำหน้า) → ลำดับตรงกับลำดับ create จริง/ลำดับใน seed

ALTER TABLE "users" ADD COLUMN "id_new" INTEGER;
WITH numbered AS (
    SELECT "id", row_number() OVER (ORDER BY "id") AS rn FROM "users"
)
UPDATE "users" u SET "id_new" = numbered.rn
FROM numbered WHERE u."id" = numbered."id";

-- ============ work_plans.userId: map เป็นเลขใหม่ ============

ALTER TABLE "work_plans" DROP CONSTRAINT "work_plans_userId_fkey";
ALTER TABLE "work_plans" ADD COLUMN "userId_new" INTEGER;
UPDATE "work_plans" wp SET "userId_new" = u."id_new"
FROM "users" u WHERE wp."userId" = u."id";

DROP INDEX "work_plans_userId_startDate_idx";
ALTER TABLE "work_plans" DROP COLUMN "userId";
ALTER TABLE "work_plans" RENAME COLUMN "userId_new" TO "userId";
ALTER TABLE "work_plans" ALTER COLUMN "userId" SET NOT NULL;

-- ============ audit_logs.userId: map เป็นเลขใหม่ ============
-- (append-only ห้ามแตะจากฝั่งแอป — schema migration แบบนี้เป็นข้อยกเว้น เหมือนตอน remap targetId)

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD COLUMN "userId_new" INTEGER;
UPDATE "audit_logs" al SET "userId_new" = u."id_new"
FROM "users" u WHERE al."userId" = u."id";

DROP INDEX "audit_logs_userId_createdAt_idx";
ALTER TABLE "audit_logs" DROP COLUMN "userId";
ALTER TABLE "audit_logs" RENAME COLUMN "userId_new" TO "userId";
ALTER TABLE "audit_logs" ALTER COLUMN "userId" SET NOT NULL;

-- ============ สลับ PK ของ users + ตั้ง sequence ============

ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
CREATE SEQUENCE "users_id_seq" OWNED BY "users"."id";
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT nextval('users_id_seq');
SELECT setval('users_id_seq', COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false);

-- ============ ประกอบ FK + index กลับ (ชื่อ/กติกาเดิมทุกตัว) ============

ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "work_plans_userId_startDate_idx" ON "work_plans"("userId", "startDate");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
