-- ประเภทงานย้ายจาก enum PlanType → lookup table plan_types
-- work_plans.type คงชื่อ column เดิม แต่เปลี่ยนเป็น TEXT + FK ไป plan_types.id
-- ค่าเดิม (SOLAR/CCTV/NETWORK) ตรงกับ id ใหม่อยู่แล้ว — cast ตรงๆ ไม่มีข้อมูลหาย

-- CreateTable
CREATE TABLE "plan_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "plan_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_types_name_key" ON "plan_types"("name");

-- Seed ประเภทงานเริ่มต้น (id คงที่ — seed.ts upsert ชุดเดียวกัน)
INSERT INTO "plan_types" ("id", "name", "sortOrder") VALUES
    ('SOLAR',    'Solar Cell', 1),
    ('CCTV',     'CCTV',       2),
    ('NETWORK',  'Network',    3),
    ('IOT',      'IOT',        4),
    ('SOFTWARE', 'Software',   5);

-- AlterTable: enum → TEXT (ค่าเดิมกลายเป็น string เดียวกัน)
ALTER TABLE "work_plans" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

-- DropEnum
DROP TYPE "PlanType";

-- AddForeignKey
ALTER TABLE "work_plans" ADD CONSTRAINT "work_plans_type_fkey"
    FOREIGN KEY ("type") REFERENCES "plan_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
