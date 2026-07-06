# CLAUDE.md

> กติกากลางทั้งหมดอยู่ที่ **[AGENT.md](./AGENT.md)** — อ่านไฟล์นั้นก่อนเสมอ
> ไฟล์นี้มีเฉพาะส่วนเพิ่มเติมสำหรับ Claude Code

## สิ่งที่ Claude Code ควรทำใน repo นี้

- ก่อนแก้ schema: อ่าน `apps/api/prisma/schema.prisma` + หัวข้อ "การตัดสินใจที่ lock แล้ว" ใน AGENT.md
- หลังแก้ router: รัน type check ทั้ง `apps/api` และ `apps/web` — เพราะ web import type จาก api
  การแก้ api อาจทำ web แดงได้ (นี่คือ feature ไม่ใช่ bug ให้แก้ตาม type error จนเขียว)
- ตอบ/เขียน commit message เป็นภาษาไทยได้ ยกเว้นศัพท์เทคนิค
- เจอการตัดสินใจ design ใหม่ที่ไม่อยู่ใน docs → เสนอให้บันทึกลง ARCHITECTURE.md หรือ AGENT.md ด้วย

## ห้าม

- ห้ามเพิ่ม dependency ใหม่โดยไม่บอกเหตุผล
- ห้าม hardcode secret / URL — ใช้ env ตามแบบใน SECURITY.md
- ห้ามลบหรือแก้ seed cases ที่มีไว้จับ bug (แผนคร่อมเดือน, แผน delay) — ถ้าจำเป็นให้เพิ่มแทน

## คำสั่งตรวจก่อนจบงานทุกครั้ง

```bash
pnpm typecheck        # รัน tsc --noEmit ทั้ง apps/api และ apps/web จาก root
```
