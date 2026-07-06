// apps/web/src/lib/trpc.ts
// tRPC client ฝั่งเว็บ (Container 1) — ชี้ไปที่ API server แยก
// type-safety ยังครบ เพราะ import "type" ของ AppRouter มาจาก apps/api
// (import type ล้วนๆ ไม่ดึงโค้ด server มา bundle — ปลอดภัย)

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../api/src/routers/_app"; // monorepo path หรือ package "@repo/api"

export const trpc = createTRPCReact<AppRouter>();

// เก็บ token ใน memory + localStorage (แลกความสะดวก dev — ดู trade-off ท้ายไฟล์)
let token: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem("token") : null;

export function getToken(): string | null {
  return token;
}

export function setToken(t: string | null) {
  token = t;
  if (typeof window !== "undefined") {
    if (t) window.localStorage.setItem("token", t);
    else window.localStorage.removeItem("token");
  }
}

export function createClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        // dev: http://localhost:4000/trpc | prod: https://api.yourdomain/trpc
        url: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/trpc",
        transformer: superjson,
        headers() {
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

// การใช้งานตอน login:
//   const login = trpc.auth.login.useMutation({
//     onSuccess: (res) => setToken(res.token),
//   });
//
// trade-off เรื่อง localStorage: สะดวกแต่โดน XSS อ่านได้
// ถ้าจะยกระดับทีหลัง เปลี่ยนเป็น httpOnly cookie ที่ API set ให้
// (ต้องเปิด credentials: true ทั้ง CORS และ link) — โครงส่วนอื่นไม่ต้องแก้
