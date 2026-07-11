-- ผูก work_plans.siteId เป็น FK จริงไปที่ sites (เดิมเป็นเลขรันอิสระจาก sequence site_id_seq)
-- แผนเดิมที่เลขไซต์ยังไม่มีในตาราง sites → backfill เป็น placeholder ก่อน ไม่งั้น FK ติดตั้งไม่ผ่าน
-- ชื่อ placeholder = "ไซต์ #N" (ไปแก้ชื่อจริงทีหลังได้ — seed ก็ upsert ทับด้วยชื่อจริงอยู่แล้ว)

-- Backfill: สร้าง Site ให้ทุก siteId ของแผนเดิมที่ยังไม่มี record จริง
INSERT INTO "sites" ("id", "name")
SELECT DISTINCT wp."siteId", 'ไซต์ #' || wp."siteId"
FROM "work_plans" wp
WHERE NOT EXISTS (SELECT 1 FROM "sites" s WHERE s."id" = wp."siteId");

-- Backfill: ให้ placeholder site มีประเภทตามแผนที่ใช้มัน (จะได้ผ่านกติกา "ไซต์ต้องมีประเภทของแผน")
INSERT INTO "_SiteToType" ("A", "B")
SELECT DISTINCT wp."siteId", wp."type"
FROM "work_plans" wp
WHERE wp."type" IS NOT NULL
ON CONFLICT DO NOTHING;

-- ดัน autoincrement ของ sites ให้พ้นเลขที่ insert แบบระบุ id เอง (advance-only ไม่ถอยกลับ)
-- DB เปล่า (fresh deploy ไม่มีแผนเดิม) → ข้าม ไม่งั้น setval จะทำให้ไซต์แรกได้เลข 2 แทน 1
SELECT setval(
  'sites_id_seq',
  GREATEST((SELECT MAX("id") FROM "sites"), (SELECT last_value FROM "sites_id_seq"))
)
WHERE EXISTS (SELECT 1 FROM "sites");

-- CreateIndex
CREATE INDEX "work_plans_siteId_idx" ON "work_plans"("siteId");

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- เลิกใช้ sequence เลขไซต์เดิม — เลขไซต์ใหม่มาจาก sites.id (autoincrement) ผ่าน site.create แทน
DROP SEQUENCE IF EXISTS "site_id_seq";
