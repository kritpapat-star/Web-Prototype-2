-- เปลี่ยน id เป็นเลขรัน (10 ก.ค. 2026):
--   work_plans.id  cuid text  → INTEGER autoincrement (renumber ตามลำดับสร้างจริง)
--   work_plans.siteId "SITE-NNN" → INTEGER (ตัด prefix — เลขเดิมคงไว้, ยัง gen จาก site_id_seq)
--   sites.id       cuid text  → INTEGER autoincrement (+ site_types.siteId ตาม)
-- audit_logs เป็น append-only ฝั่งแอป — migration นี้ remap targetId ของ workPlan.*
-- ครั้งเดียวให้ชี้เลขใหม่ ไม่งั้น log เก่าอ้าง id ที่ไม่มีอยู่แล้ว

-- ============ work_plans.id: cuid → เลขรัน ============

-- เพิ่มคอลัมน์เลขใหม่ แล้ว renumber ตาม createdAt (เสมอกันให้ id เดิมตัดสิน — เลขรันตามลำดับสร้าง)
ALTER TABLE "work_plans" ADD COLUMN "id_new" INTEGER;
WITH numbered AS (
    SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
    FROM "work_plans"
)
UPDATE "work_plans" wp SET "id_new" = numbered.rn
FROM numbered WHERE wp."id" = numbered."id";

-- remap audit_logs.targetId (เฉพาะ action workPlan.*) ให้ชี้เลขใหม่ ก่อนทิ้ง id เดิม
UPDATE "audit_logs" al SET "targetId" = wp."id_new"::text
FROM "work_plans" wp
WHERE al."targetId" = wp."id" AND al."action" LIKE 'workPlan.%';

-- สลับเป็น PK ใหม่ + ตั้ง sequence ให้ default ต่อจากเลขสูงสุดเดิม
ALTER TABLE "work_plans" DROP CONSTRAINT "work_plans_pkey";
ALTER TABLE "work_plans" DROP COLUMN "id";
ALTER TABLE "work_plans" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "work_plans" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_pkey" PRIMARY KEY ("id");
CREATE SEQUENCE "work_plans_id_seq" OWNED BY "work_plans"."id";
ALTER TABLE "work_plans" ALTER COLUMN "id" SET DEFAULT nextval('work_plans_id_seq');
SELECT setval('work_plans_id_seq', COALESCE((SELECT MAX("id") FROM "work_plans"), 0) + 1, false);

-- ============ work_plans.siteId: "SITE-NNN" → เลขล้วน ============

-- ดึงเฉพาะตัวเลขจากค่าเดิม (SITE-012 → 12) — แถวที่ไม่มีตัวเลขเลยให้ fail ดังๆ ดีกว่าเดาค่า
ALTER TABLE "work_plans"
    ALTER COLUMN "siteId" TYPE INTEGER
    USING (regexp_replace("siteId", '\D', '', 'g'))::integer;

-- ============ sites.id (+ site_types.siteId): cuid → เลขรัน ============
-- ตาราง sites ยังว่างอยู่ ณ ตอนเขียน migration — เขียนแบบ renumber เผื่อมีข้อมูลแล้วเหมือนกัน

ALTER TABLE "sites" ADD COLUMN "id_new" INTEGER;
WITH numbered AS (
    SELECT "id", row_number() OVER (ORDER BY "id") AS rn FROM "sites"
)
UPDATE "sites" s SET "id_new" = numbered.rn
FROM numbered WHERE s."id" = numbered."id";

-- แปลง site_types.siteId ตาม mapping ก่อน แล้วค่อยสลับ PK ทั้งสองตาราง
ALTER TABLE "site_types" DROP CONSTRAINT "site_types_siteId_fkey";
ALTER TABLE "site_types" ADD COLUMN "siteId_new" INTEGER;
UPDATE "site_types" st SET "siteId_new" = s."id_new"
FROM "sites" s WHERE st."siteId" = s."id";

ALTER TABLE "site_types" DROP CONSTRAINT "site_types_pkey";
ALTER TABLE "site_types" DROP COLUMN "siteId";
ALTER TABLE "site_types" RENAME COLUMN "siteId_new" TO "siteId";
ALTER TABLE "site_types" ALTER COLUMN "siteId" SET NOT NULL;

ALTER TABLE "sites" DROP CONSTRAINT "sites_pkey";
ALTER TABLE "sites" DROP COLUMN "id";
ALTER TABLE "sites" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "sites" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "sites" ADD CONSTRAINT "sites_pkey" PRIMARY KEY ("id");
CREATE SEQUENCE "sites_id_seq" OWNED BY "sites"."id";
ALTER TABLE "sites" ALTER COLUMN "id" SET DEFAULT nextval('sites_id_seq');
SELECT setval('sites_id_seq', COALESCE((SELECT MAX("id") FROM "sites"), 0) + 1, false);

-- ประกอบ PK/FK ของ site_types กลับ (กติกาเดิม: ลบไซต์ → แถวเชื่อมหายตาม)
ALTER TABLE "site_types" ADD CONSTRAINT "site_types_pkey" PRIMARY KEY ("siteId", "typeId");
ALTER TABLE "site_types" ADD CONSTRAINT "site_types_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
