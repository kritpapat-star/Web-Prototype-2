// apps/api/src/lib/env.ts
// ตรวจ env ตอน start — fail fast ก่อนรับ request แรก
// production (NODE_ENV=production ตั้งใน apps/api/Dockerfile) เข้มกว่า dev:
// ค่าอ่อน/ค่า placeholder = ไม่ยอม start เลย กันหลุดขึ้น production ทั้งระบบ

export const IS_PROD = process.env.NODE_ENV === "production";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("ต้องตั้ง JWT_SECRET ใน .env");

// กันค่า placeholder จาก .env.example + บังคับความยาวขั้นต่ำตาม checklist ใน SECURITY.md
if (secret.length < 32 || secret.includes("changeme")) {
  const msg =
    "JWT_SECRET อ่อนเกินไป — ต้องสุ่มยาว ≥ 32 ตัวอักษร เช่น `openssl rand -base64 48` (ดู SECURITY.md)";
  if (IS_PROD) throw new Error(msg);
  console.warn(`⚠️ ${msg} — ปล่อยผ่านเฉพาะ dev`);
}

export const JWT_SECRET = secret;
