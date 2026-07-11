-- เปลี่ยนตารางเชื่อม ไซต์ ↔ ประเภทงาน จาก model SiteType (site_types) ที่ประกาศเอง
-- เป็น implicit m-n ของ Prisma (_SiteToType) — โค้ดฝั่งแอปใช้ site.types ได้เหมือน array ตรงๆ
-- ทั้ง sites และ site_types ยังว่าง ณ ตอน migrate — drop ได้เลย ไม่มีข้อมูลต้องย้าย
-- ⚠️ กติกาเปลี่ยน: ลบ Type ที่มีไซต์ใช้อยู่ไม่ถูกบล็อกแล้ว (FK เดิม Restrict → ตอนนี้ cascade
-- คือหลุดจากทุกไซต์เงียบๆ) — work_plans.type ยัง Restrict เหมือนเดิม ลบ type ที่มีแผนใช้ไม่ได้
-- DropForeignKey
ALTER TABLE "site_types" DROP CONSTRAINT "site_types_siteId_fkey";

-- DropForeignKey
ALTER TABLE "site_types" DROP CONSTRAINT "site_types_typeId_fkey";

-- DropTable
DROP TABLE "site_types";

-- CreateTable
CREATE TABLE "_SiteToType" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SiteToType_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_SiteToType_B_index" ON "_SiteToType"("B");

-- AddForeignKey
ALTER TABLE "_SiteToType" ADD CONSTRAINT "_SiteToType_A_fkey" FOREIGN KEY ("A") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SiteToType" ADD CONSTRAINT "_SiteToType_B_fkey" FOREIGN KEY ("B") REFERENCES "types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
