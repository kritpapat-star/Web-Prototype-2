-- เปลี่ยน jobId → siteId (9 ก.ค. 2026): เลขรันอ้าง "ไซต์งาน" ไม่ใช่ Job
-- rename ทั้ง column และ sequence (คง counter เดิม ไม่เริ่มนับใหม่)
ALTER TABLE "work_plans" RENAME COLUMN "jobId" TO "siteId";
ALTER SEQUENCE "job_id_seq" RENAME TO "site_id_seq";

-- แปลง prefix ข้อมูลเก่า JOB-NNN → SITE-NNN ให้ format เดียวกับที่ gen ใหม่ (เลขเดิมคงไว้)
UPDATE "work_plans" SET "siteId" = 'SITE-' || substring("siteId" FROM 5) WHERE "siteId" LIKE 'JOB-%';
