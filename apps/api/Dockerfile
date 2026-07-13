# apps/api/Dockerfile — ต้อง build จาก root ของ repo (pnpm workspace):
#   docker build -f apps/api/Dockerfile .
# compose ตั้ง context: . + dockerfile: apps/api/Dockerfile ให้แล้ว
FROM node:22-alpine
RUN npm install -g pnpm@10
WORKDIR /repo

# ติดตั้ง dependency ก่อน copy source — cache layer ได้เมื่อโค้ดเปลี่ยนแต่ dep ไม่เปลี่ยน
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @repo/api

COPY apps/api apps/api
RUN pnpm --filter @repo/api exec prisma generate

# ตั้ง "หลัง" pnpm install — ถ้าตั้งก่อน pnpm จะข้าม devDependencies (tsx/prisma ที่ CMD ใช้)
# เปิด guard ฝั่ง production: JWT_SECRET/WEB_ORIGIN อ่อนหรือขาด = ไม่ start, seed ต้องมี SEED_PASSWORD
ENV NODE_ENV=production

WORKDIR /repo/apps/api
EXPOSE 4000
# migrate deploy ก่อน start — idempotent รันซ้ำตอน restart ได้
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
