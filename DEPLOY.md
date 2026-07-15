# DEPLOY.md — ขึ้น production

> คู่กับ checklist ใน [SECURITY.md](./SECURITY.md) — อ่านทั้งคู่ก่อน deploy จริง

## ภาพรวม

ระบบคือ docker compose 3 ตู้ (web / api / db) — ports ทั้งหมด bind เฉพาะ `127.0.0.1`
คนนอกเข้าได้ทางเดียวคือผ่าน **reverse proxy + HTTPS** (Bearer token วิ่งบน HTTP เปล่า = รั่ว)

## ทางเลือก hosting (เลือก 1)

| | VPS (DigitalOcean / Vultr / HostAtom) | เครื่องออฟฟิศ + Cloudflare Tunnel |
|---|---|---|
| เหมาะกับ | ใช้จริงระยะยาว ทีมเข้าจากทุกที่ | มีเครื่องอยู่แล้ว อยากเริ่มไว/ฟรี |
| ค่าใช้จ่าย | ~200–400 บาท/เดือน | ฟรี (จ่ายค่าไฟ + เน็ตออฟฟิศ) |
| HTTPS | Caddy จัดการ cert ให้อัตโนมัติ | Cloudflare จัดการให้ |
| ความเสี่ยง | — | ไฟดับ/เน็ตหลุด = ระบบล่มทั้งทีม |

ทั้งสองแบบใช้ compose เดิมไม่ต้องแก้ — ต่างกันแค่ตัวที่พา traffic เข้ามา

## เตรียม `.env` บนเครื่อง production

```bash
cp .env.example .env   # แล้วเติมค่าจริง — ห้าม commit
```

| ตัวแปร | ค่า production |
|---|---|
| `DB_PASSWORD` | สุ่มใหม่: `openssl rand -base64 24` |
| `JWT_SECRET` | สุ่มใหม่: `openssl rand -base64 48` — **ห้ามใช้ค่าเดียวกับ dev** (api ไม่ start ถ้าสั้นกว่า 32 ตัวหรือมีคำว่า changeme) |
| `WEB_ORIGIN` | โดเมนเว็บจริง เช่น `https://erp.beconnected.co.th` (CORS — production ไม่มี fallback) |
| `PUBLIC_API_URL` | URL api ที่ browser เห็น เช่น `https://api.beconnected.co.th/trpc` (bake ตอน build web) |
| `SEED_PASSWORD` | รหัสเริ่มต้นตอน seed ครั้งแรก — ตั้งแล้วลบออกจาก `.env` ได้เลย |

## Reverse proxy + HTTPS ด้วย Caddy (แนะนำสำหรับ VPS)

ติดตั้ง Caddy บน host (ไม่ใช่ใน compose) แล้วชี้ DNS ทั้ง 2 โดเมนมาที่เครื่อง — Caddy ขอ cert จาก Let's Encrypt ให้เอง:

```caddyfile
# /etc/caddy/Caddyfile
erp.beconnected.co.th {
    reverse_proxy 127.0.0.1:3000
}
api.beconnected.co.th {
    reverse_proxy 127.0.0.1:4000
}
```

```bash
sudo systemctl reload caddy
```

เปิด firewall เฉพาะ 80/443 (+ssh) พอ — ตู้ db ไม่มี port ออกมา, web/api ออกเฉพาะ loopback อยู่แล้ว

## Cloudflare Tunnel (ทางเลือกเครื่องออฟฟิศ)

ไม่ต้อง forward port — รัน `cloudflared` เพิ่มเป็น service ที่ 4 ใน compose แล้วชี้ hostname
`erp.…` → `http://web:3000` และ `api.…` → `http://api:4000` ผ่าน dashboard ของ Cloudflare
(cloudflared อยู่ใน docker network เดียวกัน เรียกชื่อ service ตรงได้ ไม่เกี่ยวกับ loopback binding)

## Deploy ครั้งแรก

```bash
git clone <repo> /srv/erp && cd /srv/erp
cp .env.example .env && nano .env        # เติมค่าตามตารางข้างบน

docker compose up -d --build             # api รัน prisma migrate deploy ให้เองก่อน start ทุกครั้ง

# สร้าง user + ข้อมูลตั้งต้น (ครั้งแรกครั้งเดียว — ต้องมี SEED_PASSWORD ไม่งั้น seed ไม่ยอมรัน)
docker compose exec api pnpm db:seed

# เปลี่ยนรหัสเป็นรายคน (seed รันซ้ำไม่ reset รหัสพวกนี้แล้ว)
docker compose exec api pnpm user:password tawan '<รหัสของ tawan>'
docker compose exec api pnpm user:password earth '<รหัสของ earth>'
docker compose exec api pnpm user:password ohm '<รหัสของ ohm>'
docker compose exec api pnpm user:password nongnoom '<รหัสของ CEO>'
```

> หมายเหตุ: seed เก็บเฉพาะข้อมูลโครงสร้าง (types 5 + users 4) ตั้งแต่ 14 ก.ค. 2026 —
> ไม่มีแผน/ไซต์ตัวอย่างให้ลบแล้ว เริ่มใช้งานจริงได้ทันทีหลังเปลี่ยนรหัสรายคน

## Backup (ห้ามข้าม)

```bash
chmod +x scripts/backup-db.sh
crontab -e
# ทุกคืนตี 2 — pg_dump ใน container ออกมาเป็น .sql.gz (เก็บ 14 วัน)
0 2 * * * /srv/erp/scripts/backup-db.sh /var/backups/erp >> /var/log/erp-backup.log 2>&1
```

เก็บเครื่องเดียว = ยังไม่ใช่ backup — ต่อ `rclone` ไป Google Drive/S3 หรือ `rsync` ไปเครื่องอื่นอีกชั้น เช่น:

```bash
30 2 * * * rclone copy /var/backups/erp gdrive:erp-backups
```

กู้คืน: `gunzip -c erp-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U beconnected -d erp`

## อัปเดตเวอร์ชัน

```bash
cd /srv/erp && git pull
docker compose up -d --build   # migration ใหม่ถูก apply อัตโนมัติ (migrate deploy ใน CMD ของ api)
```

## Logs & Restart

- ทุก service log ลง stdout — ดูย้อนหลัง: `docker compose logs -f api` (Fastify เป็น pino JSON)
  compose จำกัดขนาดไว้แล้ว (10MB × 3 ไฟล์ต่อ container) — ไม่ต้องกลัว log กินดิสก์จนเต็ม
- ทุก service มี `restart: unless-stopped` — เครื่อง reboot/container ตายแล้วขึ้นเอง
  (ตรวจหลัง deploy: `sudo reboot` หนึ่งครั้งแล้วดูว่า `docker compose ps` ขึ้นครบ 3 ตู้)

## เช็คก่อนเปิดให้ทีมใช้

- [ ] `https://erp.…` เปิดได้ + login ผ่าน / `http://` ธรรมดาเข้าไม่ได้หรือ redirect
- [ ] `docker compose exec db pg_isready` ok และ **ไม่มี** port 5432/3000/4000 เปิด public (`ss -tlnp`)
- [ ] login ผิด 5 ครั้ง → โดนล็อก 15 นาที (rate limit ทำงาน)
- [ ] ทดสอบ role จริง: login เป็น CEO ต้องไม่มีปุ่มแก้/ยิง mutation โดน FORBIDDEN,
      login เป็น Engineer แก้แผนคนอื่นไม่ได้ เห็นเฉพาะแผนตัวเอง
      (ชุดเดียวกับที่ทดสอบผ่านแล้วใน dev 13 ก.ค. 2026 — ยิงซ้ำบน production หลัง deploy)
- [ ] reboot เครื่องหนึ่งครั้ง → container ขึ้นเองครบ + เว็บกลับมาใช้ได้
- [ ] รัน `scripts/backup-db.sh` มือหนึ่งครั้ง + ลอง restore ใส่ DB เปล่าดูว่ากลับมาจริง
- [ ] เปลี่ยนรหัสผ่านครบทุก user (`SEED_PASSWORD` และรหัส dev ห้ามเหลือใช้งาน)
