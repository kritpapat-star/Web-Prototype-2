-- ตารางไซต์งาน — เก็บ id / name / type (FK → types.id แบบเดียวกับ work_plans.type)
-- ยังไม่ผูกกับ work_plans — รอ requirement

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sites_type_idx" ON "sites"("type");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_type_fkey"
    FOREIGN KEY ("type") REFERENCES "types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
