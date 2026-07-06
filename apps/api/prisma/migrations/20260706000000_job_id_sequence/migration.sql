-- เลขรัน Job ID อัตโนมัติ (JOB-001, JOB-002, …)
-- ไม่ใช่ตารางใหม่ — เป็น sequence ของ Postgres ให้ workPlan.create ดึง nextval ไป gen jobId
-- (jobId ยังเป็น string ตามการตัดสินใจที่ lock ไว้ — รอ Job table ค่อย migrate)
CREATE SEQUENCE IF NOT EXISTS "job_id_seq" START WITH 1;
