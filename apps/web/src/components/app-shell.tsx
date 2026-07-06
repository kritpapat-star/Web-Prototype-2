"use client";

// โครงหน้าหลัง login ตาม UI อ้างอิง: sidebar "Be Connected" + topbar (ชื่อหน้า + กระดิ่ง) + เนื้อหา
// เมนูอื่นนอกจาก "งานของฉัน" เป็นโมดูลอนาคต (คลังอุปกรณ์ / ยืม-คืน / ลงเวลา / ลา)
// — โชว์ตำแหน่งไว้ตาม design แต่ยังกดไม่ได้ จนกว่าโมดูลนั้นจะถูกสร้าง

const NAV_ITEMS = [
  { key: "my-work", label: "งานของฉัน", enabled: true },
  { key: "inventory", label: "คลังอุปกรณ์", enabled: false },
  { key: "borrow-return", label: "ยืม-คืน", enabled: false },
  { key: "time", label: "ลงเวลา", enabled: false },
  { key: "leave", label: "ลา", enabled: false },
] as const;

export function AppShell({
  title,
  user,
  onLogout,
  children,
}: {
  title: string;
  user: { name: string; role: string };
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Be Connected</div>

        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.key}
              className={item.enabled ? "nav-item active" : "nav-item disabled"}
              title={item.enabled ? undefined : "โมดูลถัดไป — ยังไม่เปิดใช้งาน"}
            >
              <span className="bullet" />
              {item.label}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role === "CEO" ? "CEO" : "Engineer"}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <h1>{title}</h1>
          <button className="bell-btn" aria-label="การแจ้งเตือน" title="การแจ้งเตือน (เร็วๆ นี้)">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </button>
        </header>

        <div className="page">{children}</div>
      </div>
    </div>
  );
}
