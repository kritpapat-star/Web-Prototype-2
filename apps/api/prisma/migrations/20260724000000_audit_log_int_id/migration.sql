-- audit_logs.id: TEXT (cuid) -> INTEGER autoincrement
-- เจ้าของกลับมติเดิม (20 ก.ค. 2026 "audit_logs คง cuid") — 24 ก.ค. 2026 สั่งให้ id เป็นเลขรันเหมือนตารางอื่น
-- ไม่มี FK ไหนชี้มาที่ audit_logs.id (targetId เป็น text อิสระ ไม่ผูก FK) — เขียน PK ใหม่ได้ปลอดภัย
-- id ใหม่ไล่ตาม createdAt ให้เรียงตามเวลาจริง (ทำลาย cuid เดิมถาวร — สำรอง row ไว้ก่อนแล้ว)

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_pkey";

ALTER TABLE "audit_logs" ADD COLUMN "id_new" INTEGER;

WITH numbered AS (
  SELECT ctid, ROW_NUMBER() OVER (ORDER BY "createdAt", ctid) AS rn
  FROM "audit_logs"
)
UPDATE "audit_logs" al
SET "id_new" = numbered.rn
FROM numbered
WHERE al.ctid = numbered.ctid;

ALTER TABLE "audit_logs" DROP COLUMN "id";
ALTER TABLE "audit_logs" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET NOT NULL;

-- sequence สำหรับ autoincrement (ตั้งชื่อ + ต่อ default แบบเดียวกับที่ Prisma คาดหวังจาก @default(autoincrement()))
CREATE SEQUENCE "audit_logs_id_seq" OWNED BY "audit_logs"."id";
SELECT setval('"audit_logs_id_seq"', COALESCE((SELECT MAX("id") FROM "audit_logs"), 0) + 1, false);
ALTER TABLE "audit_logs" ALTER COLUMN "id" SET DEFAULT nextval('"audit_logs_id_seq"');

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");
