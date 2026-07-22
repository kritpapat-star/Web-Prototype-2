// apps/api/src/routers/_app.ts
import { router } from "../trpc";
import { authRouter } from "./auth";
import { workPlanRouter } from "./workPlan";
import { auditLogRouter } from "./auditLog";
import { typeRouter } from "./type";
import { siteRouter } from "./site";
import { ticketRouter } from "./ticket";
import { userRouter } from "./user";
import { notificationRouter } from "./notification";

export const appRouter = router({
  auth: authRouter,
  workPlan: workPlanRouter,
  auditLog: auditLogRouter,
  type: typeRouter,
  site: siteRouter,
  ticket: ticketRouter,
  user: userRouter,
  notification: notificationRouter,
});

// type นี้คือสัญญาที่ฝั่งเว็บ import ไปใช้ (ผ่าน monorepo package)
export type AppRouter = typeof appRouter;
