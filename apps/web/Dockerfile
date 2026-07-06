# apps/web/Dockerfile — ต้อง build จาก root ของ repo (pnpm workspace):
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .
# เหตุที่ต้องใช้ root context: next build typecheck ตาม import type ไปถึง apps/api
FROM node:22-alpine
RUN npm install -g pnpm@10
WORKDIR /repo

# ⚠️ NEXT_PUBLIC_* ถูก inline ตอน next build → ต้องเป็น build ARG ไม่ใช่ runtime env
# และต้องเป็น URL ที่ browser มองเห็น (โดเมนจริง) ไม่ใช่ http://api:4000
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ต้อง generate prisma client ก่อน — type ของ AppRouter อ้างถึง model จาก @prisma/client
COPY apps/api apps/api
RUN pnpm --filter @repo/api exec prisma generate
COPY apps/web apps/web
RUN pnpm --filter @repo/web build

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
