-- เปลี่ยนชื่อ assigneeId → assignedId ให้ตรงชื่อ AssignedId ในสเปคเจ้าของ (20 ก.ค. 2026)
-- ใช้ RENAME ล้วน ๆ — ข้อมูลใบเดิมอยู่ครบ ไม่มี drop/add

ALTER TABLE "tickets" RENAME COLUMN "assigneeId" TO "assignedId";
ALTER INDEX "tickets_assigneeId_createdAt_idx" RENAME TO "tickets_assignedId_createdAt_idx";
ALTER TABLE "tickets" RENAME CONSTRAINT "tickets_assigneeId_fkey" TO "tickets_assignedId_fkey";
