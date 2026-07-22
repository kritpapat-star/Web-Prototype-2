# SECURITY.md — แนวปฏิบัติด้านความปลอดภัย

## Authentication

- **Password:** เก็บเฉพาะ `passwordHash` จาก bcrypt (cost 10) — **ห้ามเก็บ plaintext ทุกกรณี**
- **Login:** ตอบ error ข้อความเดียวกันเสมอไม่ว่า username ไม่มีหรือรหัสผิด (กัน user enumeration)
- **JWT:** อายุ 12 ชม. (ครอบ 1 กะงาน) payload มีแค่ `{ sub, role, name }` (`sub` = user id เลขรัน Int) — ห้ามใส่ข้อมูล sensitive
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
3. ~~ไม่มี rate limit ที่ `auth.login`~~ — **เพิ่มแล้ว 13 ก.ค. 2026**: นับเฉพาะครั้งที่ผิด
   ต่อคู่ ip+username — ผิด 5 ครั้ง ล็อก 15 นาที (in-memory ใน `routers/auth.ts` —
   พอสำหรับ api instance เดียว ถ้า scale หลาย instance ต้องย้ายไป store กลาง)
4. **รหัสผ่าน seed ชุดเดียวทุก user** — ลดความเสี่ยงแล้ว 13 ก.ค. 2026:
   - production ต้องตั้ง `SEED_PASSWORD` เอง ไม่งั้น seed ไม่ยอมรัน (guard เช็ค `NODE_ENV`)
   - seed รันซ้ำ**ไม่ reset รหัส user เดิม** (upsert ไม่ write `passwordHash` ตอน update)
   - เปลี่ยนรหัสรายคน: `pnpm user:password <username> <รหัสใหม่>` (`apps/api/scripts/set-password.ts`)
   ยังค้าง: หน้าเปลี่ยนรหัสผ่าน + บังคับเปลี่ยนครั้งแรกใน UI (อยู่ใน Backlog ของ TASK.md)

5. ~~Token ใน query string ของรูปแนบเคส~~ — **หมดประเด็นแล้ว 20 ก.ค. 2026**: ฟีเจอร์รูปแนบเคส
   ถูกถอดออกทั้งชุด (endpoint `/uploads/*` ถูกลบ — เลิกเก็บรูป/metadata ใน DB, จะย้ายไปเก็บที่อื่น)
   ถ้าฟีเจอร์รูปกลับมาในรูปแบบเสิร์ฟไฟล์ผ่าน API อีก ให้ทบทวน trade-off นี้ใหม่ (token ใน query string
   โผล่ใน access log — ทางยกระดับคือ signed URL อายุสั้นแยกจาก JWT หลัก)

(DEV BYPASS login ที่เคยเปิดชั่วคราว 4 ก.ค. 2026 **ลบออกแล้ว** — login จริงทำงานทั้งระบบตั้งแต่ 8 ก.ค. 2026)

## Checklist ก่อน deploy production

> ขั้นตอน deploy เต็มๆ (Caddy/HTTPS, seed ครั้งแรก, backup cron) อยู่ที่ [DEPLOY.md](./DEPLOY.md)

- [ ] `JWT_SECRET` สุ่มยาว ≥ 32 ตัวอักษร — **มี guard แล้ว**: production api ไม่ start
      ถ้าสั้นกว่า 32 หรือมีคำว่า `changeme` (`apps/api/src/lib/env.ts`)
- [ ] HTTPS ครบทั้ง 2 โดเมน (web + api) — compose bind ports เฉพาะ `127.0.0.1` แล้ว
      คนนอกเข้าได้ทาง reverse proxy เท่านั้น
- [ ] `WEB_ORIGIN` เป็นโดเมนจริง — **มี guard แล้ว**: production ไม่มี fallback localhost
- [ ] เปลี่ยนรหัสผ่าน seed ทุก user (`pnpm user:password`) — seed production ต้องมี `SEED_PASSWORD`
- [x] rate limit ที่ login (13 ก.ค. 2026 — ดูหัวข้อ Trade-off ข้อ 3)
- [ ] ตั้ง backup อัตโนมัติ + ลอง restore จริง 1 ครั้ง (`scripts/backup-db.sh` + cron — ดู DEPLOY.md)
- [ ] `docker compose config` เช็คว่าไม่มี secret รั่วใน image (โดยเฉพาะ build args)
