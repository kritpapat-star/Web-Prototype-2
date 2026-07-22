-- types.id เป็น Int (เจ้าของสั่ง 20 ก.ค. 2026 — id ทุกตารางเป็นเลขรัน ยกเว้น audit_logs คง cuid)
-- ค่าเดิมเป็นเลขในรูป string ("1".."5") อยู่แล้ว — cast ตรงๆ ข้อมูลอยู่ครบ ไม่มี drop/add
-- ต้อง drop FK ที่ชี้มาก่อน แล้วแปลงชนิดพร้อมกันทุก column ที่เกี่ยว ค่อยต่อ FK กลับ

-- DropForeignKey
ALTER TABLE "work_plans" DROP CONSTRAINT "work_plans_type_fkey";
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_type_fkey";
ALTER TABLE "_SiteToType" DROP CONSTRAINT "_SiteToType_B_fkey";

-- AlterColumn text → integer
ALTER TABLE "types" ALTER COLUMN "id" TYPE INTEGER USING "id"::integer;
ALTER TABLE "work_plans" ALTER COLUMN "type" TYPE INTEGER USING "type"::integer;
ALTER TABLE "tickets" ALTER COLUMN "type" TYPE INTEGER USING "type"::integer;
ALTER TABLE "_SiteToType" ALTER COLUMN "B" TYPE INTEGER USING "B"::integer;

-- AddForeignKey (กติกาเดิมทุกเส้น: type เป็น SetNull, join table เป็น Cascade)
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_type_fkey" FOREIGN KEY ("type") REFERENCES "types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_type_fkey" FOREIGN KEY ("type") REFERENCES "types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_SiteToType" ADD CONSTRAINT "_SiteToType_B_fkey" FOREIGN KEY ("B") REFERENCES "types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
