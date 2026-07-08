"use client";

// รวม provider ฝั่ง client: React Query + tRPC client (ดู src/lib/trpc.ts)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { trpc, createClient } from "../lib/trpc";
import { ClickLogger } from "../components/click-logger";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* ดักทุกคลิกทั้งเว็บ → เก็บลง audit_logs (mount ครั้งเดียว ครอบทุกหน้า) */}
        <ClickLogger />
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
