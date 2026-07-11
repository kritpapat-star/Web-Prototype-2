-- ไซต์มีได้หลายประเภทไม่จำกัดจำนวน — เปลี่ยนจาก column เดี่ยว sites.type
-- เป็นตารางเชื่อม site_types (m-n) — ตอนนี้ sites ยังว่าง ไม่มีข้อมูลต้องย้าย

-- CreateTable
CREATE TABLE "site_types" (
    "siteId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,

    CONSTRAINT "site_types_pkey" PRIMARY KEY ("siteId","typeId")
);

-- CreateIndex
CREATE INDEX "site_types_typeId_idx" ON "site_types"("typeId");

-- AddForeignKey
ALTER TABLE "site_types" ADD CONSTRAINT "site_types_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_types" ADD CONSTRAINT "site_types_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ลบ column เดี่ยวเดิม (พร้อม FK + index ของมัน)
ALTER TABLE "sites" DROP CONSTRAINT "sites_type_fkey";
DROP INDEX "sites_type_idx";
ALTER TABLE "sites" DROP COLUMN "type";
