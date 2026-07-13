# งานของฉัน (My Work) — Be Connected ERP

Module แรกของระบบ ERP สำหรับงาน field operations ของ Be Connected (CCTV / Solar / Network)
ให้ Engineer วางแผนงาน เช็คงานประจำวัน และสรุปผล — CEO เห็นปฏิทินรวมของทั้งทีม

## Scope ปัจจุบัน

- **1 module:** งานของฉัน (ปฏิทิน / แผนงาน / สิ่งที่ต้องทำ / สรุป)
- **2 roles:** `CEO` (ดูอย่างเดียว) / `ENGINEER` (จัดการแผนของตัวเอง)

## Stack

| ส่วน | เทคโนโลยี |
|---|---|
| Web (Container 1) | Next.js + React + tRPC client |
| API (Container 2) | Fastify + tRPC + Prisma + JWT |
| Database (Container 3) | PostgreSQL 16 |
| Deploy | Docker Compose บน self-hosted VPS |

> Architecture แบบ B: เว็บเรียกผ่าน API เท่านั้น — มีแค่ API container ที่เห็น `DATABASE_URL`
> รายละเอียดดู [ARCHITECTURE.md](./ARCHITECTURE.md)

## โครงสร้าง repo (pnpm workspace monorepo)

```
apps/
  web/            # Next.js — UI อย่างเดียว ไม่มี Prisma
  api/            # Fastify + tRPC + Prisma — ตัวเดียวที่คุย DB
    prisma/       # schema, migrations, seed
docker-compose.yml
pnpm-workspace.yaml
*.md              # เอกสารทั้งหมดอยู่ที่ root
```

## Quick start (dev)

```bash
# 0) ติดตั้ง dependency ทั้ง workspace (ต้องมี pnpm — npm i -g pnpm)
pnpm install

# 1) ตั้งค่า env
cp .env.example .env                     # ของ docker compose — กรอก DB_PASSWORD, JWT_SECRET, PUBLIC_API_URL
cp apps/api/.env.example apps/api/.env   # ของ api ตอน dev นอก docker

# 2) ขึ้น database
# ⚠️ compose ไม่เปิด port db ออกมา (ตาม SECURITY.md) — dev นอก docker
# ต้องเพิ่ม ports "127.0.0.1:5432:5432" ให้ service db ชั่วคราว หรือรัน postgres เอง
docker compose up -d db

# 3) migrate + seed
cd apps/api
pnpm db:migrate
pnpm db:seed           # ได้ user: nongnoom (CEO) / tawan / earth / ohm — รหัส dev ดูใน apps/api/prisma/seed.ts

# 4) รัน API + web พร้อมกันจาก root
pnpm dev               # api → :4000, web → :3000
```

## เอกสารที่ควรอ่านตามลำดับ

1. [CONTEXT.md](./CONTEXT.md) — ธุรกิจและที่มาของ product decisions
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — โครงสร้างระบบ + เหตุผลของทุก design ที่ lock ไว้
3. [API.md](./API.md) — spec ของทุก tRPC procedure
4. [SECURITY.md](./SECURITY.md) — auth, RBAC, กติกาเรื่อง secret
5. [TESTING.md](./TESTING.md) — แนวทางทดสอบ + edge cases สำคัญ
6. [TASK.md](./TASK.md) — สถานะงาน done / doing / backlog
7. [DEPLOY.md](./DEPLOY.md) — ขึ้น production: hosting, HTTPS/Caddy, seed ครั้งแรก, backup

> สำหรับ AI coding agent: อ่าน [AGENT.md](./AGENT.md) ก่อนแก้โค้ดทุกครั้ง
