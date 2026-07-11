-- PlanType → Type: เปลี่ยนชื่อ table plan_types → types
-- + ลบ sortOrder — จำกัดไว้ ~5 ประเภท เรียงตาม id พอ (ดู comment ใน schema.prisma)
-- rename constraint/index ให้ตรง convention ของ Prisma (types_pkey, types_name_key) กัน drift
-- FK ฝั่ง work_plans ชื่อ work_plans_type_fkey ตั้งตาม table ลูก — ไม่ต้องแตะ

ALTER TABLE "plan_types" RENAME TO "types";
ALTER TABLE "types" RENAME CONSTRAINT "plan_types_pkey" TO "types_pkey";
ALTER INDEX "plan_types_name_key" RENAME TO "types_name_key";
ALTER TABLE "types" DROP COLUMN "sortOrder";
