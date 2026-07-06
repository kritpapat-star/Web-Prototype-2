# SECURITY.md — แนวปฏิบัติด้านความปลอดภัย

## Authentication

- **Password:** เก็บเฉพาะ `passwordHash` จาก bcrypt (cost 10) — **ห้ามเก็บ plaintext ทุกกรณี**
- **Login:** ตอบ error ข้อความเดียวกันเสมอไม่ว่า username ไม่มีหรือรหัสผิด (กัน user enumeration)
- **JWT:** อายุ 12 ชม. (ครอบ 1 กะงาน) payload มีแค่ `{ sub, role, name }` — ห้ามใส่ข้อมูล sensitive
  เพราะ payload อ่านได้โดยไม่ต้องรู้ secret (แค่ verify ไม่ได้)
- Token หมดอายุ/ปลอม → context ตีเป็น "ไม่ได้ login" → `UNAUTHORIZED` (fail closed)

## Authorization (RBAC)

3 ชั้น — ต้องผ่านครบ ไม่มีชั้นไหนไว้ใจ client:

1. **Middleware:** `protectedProcedure` → `engineerProcedure`
   ทุก mutation ของ WorkPlan อยู่หลัง `engineerProcedure` — CEO เป็น view-only โดยโครงสร้าง ไม่ใช่โดยข้อตกลง
2. **Query filter:** Engineer ถูกล็อก `userId = ctx.user.sub` เสมอ — ค่า `userId` จาก client ถูก ignore
3. **Ownership check:** ทุก mutation เช็ค `plan.userId === ctx.user.sub` ก่อนแก้ (`FORBIDDEN` ถ้าไม่ใช่)

กติกาเวลาเพิ่ม procedure ใหม่: เริ่มจาก procedure ที่**แคบที่สุด**ก่อน แล้วค่อยผ่อน — ห้ามเริ่มจาก `publicProcedure`

## Secrets

| ค่า | อยู่ที่ไหน | ห้าม |
|---|---|---|
| `DATABASE_URL` | api container (runtime env) | โผล่ใน web / client / git |
| `JWT_SECRET` | api container (runtime env) | โผล่ที่อื่นใดทั้งสิ้น |
| `DB_PASSWORD` | `.env` บน VPS | commit ลง git |
| `NEXT_PUBLIC_*` | bake ลง JS bundle ตอน build | **ใส่ secret เด็ดขาด** — user ทุกคน view-source เห็น |

- `.env` ต้องอยู่ใน `.gitignore` — repo มีแค่ `.env.example` (ค่า placeholder)
- rotate `JWT_SECRET` = ทุก token เก่าใช้ไม่ได้ทันที (ใช้เป็นปุ่ม force logout ทั้งระบบได้)

## Network

- **DB ไม่เปิด port ออกนอก docker network** — เข้าถึงได้จาก api container เท่านั้น
- **CORS:** เปิดเฉพาะ origin ของเว็บเรา (`WEB_ORIGIN`) ไม่ใช้ `*`
- Production ต้องเป็น HTTPS ทั้ง web และ api (Bearer token วิ่งบน plaintext HTTP = รั่ว)

## Trade-off ที่รับรู้แล้ว (ยังไม่แก้ — บันทึกไว้กันลืม)

1. **Token ใน localStorage** — สะดวก dev แต่ XSS อ่านได้
   ทางยกระดับ: httpOnly cookie ที่ api set (ต้องเปิด `credentials` ทั้ง CORS และ tRPC link)
   ตัดสินใจ: ยอมรับได้สำหรับระบบภายใน user หลักสิบคน — ทบทวนเมื่อเปิดใช้นอกองค์กร
2. **ไม่มี refresh token** — หมด 12 ชม. login ใหม่ ยอมรับได้ในบริบทงานรายวัน
3. **ไม่มี rate limit ที่ `auth.login`** — ควรเพิ่ม (เช่น `@fastify/rate-limit`) ก่อนเปิด internet จริง
4. **รหัส seed `1234`** — dev เท่านั้น ห้ามหลุดไป production; ตอน onboard จริงต้องบังคับตั้งรหัสใหม่
5. **DEV BYPASS login (ชั่วคราว — ตั้งแต่ 4 ก.ค. 2026)** — request ที่ไม่มี token ถูกนับเป็น `tawan`
   และหน้า login ถูกข้าม (3 จุด: `apps/api/src/trpc.ts` / `apps/web/src/app/page.tsx` /
   `dashboard/page.tsx`) — **auth ทั้งระบบถูกปิดอยู่โดยเจตนา ห้ามออกนอกเครื่อง dev เด็ดขาด**
   งานลบอยู่ใน TASK.md Next ข้อ 1

## Checklist ก่อน deploy production

- [ ] **ลบ DEV BYPASS ทั้ง 3 จุด** (`apps/api/src/trpc.ts` / `apps/web/src/app/page.tsx` / `dashboard/page.tsx`)
- [ ] `JWT_SECRET` สุ่มยาว ≥ 32 ตัวอักษร (ไม่ใช่คำเดาได้)
- [ ] HTTPS ครบทั้ง 2 โดเมน (web + api)
- [ ] เปลี่ยนรหัสผ่าน seed ทุก user / ปิด seed ใน production
- [ ] เพิ่ม rate limit ที่ login
- [ ] `docker compose config` เช็คว่าไม่มี secret รั่วใน image (โดยเฉพาะ build args)
