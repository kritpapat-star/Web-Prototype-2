-- เพิ่มระบบแจ้งซ่อม (tickets + ticket_images) — 18 ก.ค. 2026
-- siteId บังคับเสมอ (งานซ่อมต้องรู้หน้างาน — ตัดสินใจ 18 ก.ค. 2026 รอบสอง ก่อน migration นี้ถูก apply ที่ไหน)
-- SQL gen จาก `prisma migrate diff --from-empty --to-schema-datamodel` แล้วตัดเฉพาะส่วนใหม่
-- (เขียน migration ด้วยมือเพราะเครื่อง dev ไม่มี DB นอก docker ให้ migrate dev ต่อ — ดู DEPLOY.md)

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "type" TEXT,
    "siteId" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "appointmentAt" TIMESTAMP(3),
    "workPlanId" INTEGER,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_images" (
    "id" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_workPlanId_key" ON "tickets"("workPlanId");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_createdAt_idx" ON "tickets"("assigneeId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");

-- CreateIndex
CREATE INDEX "tickets_siteId_idx" ON "tickets"("siteId");

-- CreateIndex
CREATE INDEX "ticket_images_ticketId_idx" ON "ticket_images"("ticketId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_type_fkey" FOREIGN KEY ("type") REFERENCES "types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "work_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_images" ADD CONSTRAINT "ticket_images_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
