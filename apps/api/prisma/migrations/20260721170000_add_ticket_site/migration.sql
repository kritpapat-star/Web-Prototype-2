-- ticket.siteId กลับมาเป็น optional (21 ก.ค. 2026 — เจ้าของสั่ง)
-- ตอนเปิดแจ้งซ่อมเลือกไซต์ได้ถ้ารู้ (ลูกค้าเดิม) ไม่รู้ก็ปล่อยว่าง → ช่างเลือก/สร้างไซต์ตอนกด "รับเป็นแผนงาน"
-- nullable + ON DELETE SET NULL: ลบไซต์ไม่ลบใบแจ้งซ่อม (เหลือ siteId=null)
-- (inverse ของ slim_tickets 20260720150000 ที่เคย drop column/FK/index นี้ออก)

-- AddColumn
ALTER TABLE "tickets" ADD COLUMN "siteId" INTEGER;

-- CreateIndex
CREATE INDEX "tickets_siteId_idx" ON "tickets"("siteId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
