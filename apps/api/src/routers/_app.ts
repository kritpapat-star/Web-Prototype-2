// apps/api/src/routers/_app.ts
import { router } from "../trpc";
import { authRouter } from "./auth";
import { workPlanRouter } from "./workPlan";
import { logRouter } from "./log";
import { typeRouter } from "./type";
import { siteRouter } from "./site";
import { ticketRouter } from "./ticket";
import { userRouter } from "./user";
import { notificationRouter } from "./notification";
import { overdueRouter } from "./overdue";

export const appRouter = router({
  auth: authRouter,
  workPlan: workPlanRouter,
  log: logRouter,
  type: typeRouter,
  site: siteRouter,
  ticket: ticketRouter,
  user: userRouter,
  notification: notificationRouter,
  overdue: overdueRouter,
});

// type นี้คือสัญญาที่ฝั่งเว็บ import ไปใช้ (ผ่าน monorepo package)
export type AppRouter = typeof appRouter;
