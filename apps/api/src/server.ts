// apps/api/src/server.ts
// Entry point ของ API server (Container 2)
// Fastify + tRPC adapter — ตัวเดียวในระบบที่ถือ DATABASE_URL

import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./routers/_app";
import { createContext } from "./trpc";
import { IS_PROD } from "./lib/env";

// ใช้ API_PORT ไม่ใช่ PORT — กันตัวแปรรั่วไปชนกับ Next.js (Next อ่าน PORT เหมือนกัน)
const port = Number(process.env.API_PORT ?? 4000);
// origin ของหน้าเว็บ — production บังคับตั้งเป็นโดเมนจริง เช่น https://erp.beconnected.co.th
// (fallback localhost มีเฉพาะ dev — ห้ามให้ CORS production ชี้ localhost เงียบๆ)
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? (IS_PROD ? "" : "http://localhost:3000");
if (!WEB_ORIGIN) throw new Error("production ต้องตั้ง WEB_ORIGIN เป็นโดเมนจริงของหน้าเว็บ (ดู DEPLOY.md)");

async function main() {
  const app = Fastify({ logger: true });

  // เว็บอยู่คนละ origin กับ API → ต้องเปิด CORS ให้เฉพาะโดเมนเว็บเรา
  await app.register(cors, {
    origin: WEB_ORIGIN,
    credentials: false, // ใช้ Bearer token ไม่ใช้ cookie — ไม่ต้องส่ง credentials
  });

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }: { path?: string; error: Error }) {
        app.log.error({ path, err: error.message });
      },
    },
  });

  app.get("/health", async () => ({ ok: true })); // สำหรับ Docker healthcheck

  await app.listen({ port, host: "0.0.0.0" }); // 0.0.0.0 จำเป็นใน container
  console.log(`API พร้อมที่ :${port}/trpc`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
