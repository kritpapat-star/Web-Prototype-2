"use client";

// หน้า login — TASK.md Next #1: form + trpc.auth.login + setToken + redirect
// ตอนนี้ทุก role ลง /dashboard เหมือนกัน (CEO เห็นของทุกคน — API จัดการ RBAC ให้แล้ว)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { trpc, getToken, setToken } from "../lib/trpc";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // มี token ค้างอยู่ → ข้ามไป dashboard เลย ไม่ต้อง login ซ้ำ
  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  const login = trpc.auth.login.useMutation({
    onSuccess: (res) => {
      setToken(res.token);
      // ล้าง cache ทั้งหมดก่อนเข้า dashboard — ไม่งั้น auth.me ที่ error ค้างจากรอบ
      // token หมดอายุจะโดน effect ฝั่ง dashboard อ่านเจอแล้วล้าง token ใหม่ทิ้ง
      // (อาการ "ต้อง refresh ถึงจะ login ได้") + กันข้อมูล user เก่าโผล่ตอนสลับบัญชี
      queryClient.removeQueries();
      router.push("/dashboard");
    },
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        background: "#f3f4f6",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ username, password });
        }}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,.1)",
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Be Connected</h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>เข้าสู่ระบบเพื่อดูงานของคุณ</p>

        <label style={{ fontSize: 14 }}>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 14 }}>
          รหัสผ่าน
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>

        {login.error && (
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>{login.error.message}</p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          style={{
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: login.isPending ? "#93c5fd" : "#2563eb",
            color: "#fff",
            fontSize: 15,
            cursor: login.isPending ? "default" : "pointer",
          }}
        >
          {login.isPending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 15,
  boxSizing: "border-box",
};
