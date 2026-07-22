// Be Connected — ERD snapshot: ก่อนเพิ่ม tickets/notifications
// แปลงจาก Prisma migration SQL → DBML (dbdiagram.io)

Enum Role {
  CEO
  ENGINEER
}

Table types {
  id integer [primary key]
  name text [unique]
}

Table sites {
  id integer [primary key]
  name text [not null]
}

Table users {
  id integer [primary key]
  username text [unique]
  passwordHash text [not null]
  name text [not null]
  role Role [not null]
  color text [not null]
}

Table work_plans {
  id integer [primary key]
  siteId integer [not null, note: 'FK → sites.id']
  userId integer [not null, note: 'FK → users.id']
  name text [not null]
  type integer [note: 'FK → types.id (optional)']
  startDate date [not null]
  endDate date [not null]
  actStart timestamp
  actEnd timestamp
  delayStartReason text
  delayEndReason text
  createdAt timestamp [not null, default: 'now()']
  updatedAt timestamp [not null]

  indexes {
    (userId, startDate) [name: 'work_plans_userId_startDate_idx']
    (startDate, endDate) [name: 'work_plans_startDate_endDate_idx']
    (siteId) [name: 'work_plans_siteId_idx']
  }
}

Table audit_logs {
  id text [primary key, note: 'cuid']
  userId integer [not null, note: 'FK → users.id']
  action text [not null]
  targetId text
  detail jsonb
  createdAt timestamp [not null, default: 'now()']

  indexes {
    (createdAt) [name: 'audit_logs_createdAt_idx']
    (userId, createdAt) [name: 'audit_logs_userId_createdAt_idx']
  }
}

Table _SiteToType {
  A integer [not null, note: 'FK → sites.id']
  B integer [not null, note: 'FK → types.id']

  indexes {
    (A, B) [pk, name: '_SiteToType_AB_pkey']
    (B) [name: '_SiteToType_B_index']
  }
}

Ref work_plans_user: work_plans.userId > users.id // many-to-one
Ref work_plans_type: work_plans.type > types.id // many-to-one (optional)
Ref work_plans_site: work_plans.siteId > sites.id // many-to-one
Ref audit_logs_user: audit_logs.userId > users.id // many-to-one
Ref site_to_type_site: _SiteToType.A > sites.id // many-to-one
Ref site_to_type_type: _SiteToType.B > types.id // many-to-one

Records types(id, name) {
  1, 'Solar Cell'
  2, 'CCTV'
  3, 'Network'
  4, 'IOT'
  5, 'Software'
}

Records users(id, username, name, role, color) {
  1, 'nongnoom', 'nongnoom', 'CEO', '#6366f1'
  2, 'tawan', 'Tawan', 'ENGINEER', '#0ea5e9'
  3, 'earth', 'Earth', 'ENGINEER', '#f59e0b'
  4, 'ohm', 'Ohm', 'ENGINEER', '#10b981'
}
