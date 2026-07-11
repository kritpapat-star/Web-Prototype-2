-- เปลี่ยน id ของ plan_types จากรหัสตัวอักษร (SOLAR, CCTV, …) เป็นเลขลำดับ "1"–"5"
-- work_plans.type อัปเดตตามอัตโนมัติผ่าน FK ON UPDATE CASCADE — ไม่มีข้อมูลหาย
-- (audit log เก่าที่เก็บรหัสตัวอักษรไว้ปล่อยตามเดิม — append-only, ฝั่ง web map ทั้งสองแบบ)

UPDATE "plan_types" SET "id" = '1' WHERE "id" = 'SOLAR';
UPDATE "plan_types" SET "id" = '2' WHERE "id" = 'CCTV';
UPDATE "plan_types" SET "id" = '3' WHERE "id" = 'NETWORK';
UPDATE "plan_types" SET "id" = '4' WHERE "id" = 'IOT';
UPDATE "plan_types" SET "id" = '5' WHERE "id" = 'SOFTWARE';
