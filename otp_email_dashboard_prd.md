# PRD - OTP Email Admin Dashboard

## 1. Overview

Platform web untuk super admin yang digunakan untuk:
- menghubungkan banyak akun email melalui OAuth,
- menerima dan menampilkan OTP otomatis dari email,
- mengelola user sederhana,
- membagikan akses OTP ke user melalui link khusus.

Sistem ini hanya memiliki satu dashboard admin. User tidak login ke sistem admin. User hanya membuka link akses khusus yang diberikan admin.

---

## 2. Product Direction

### Core Concept
- 1 user hanya boleh terhubung ke 1 inbox email
- 1 inbox email boleh terhubung ke maksimal 3 user
- setiap user memiliki link akses unik
- link akses berlaku terus sampai di-disable atau di-regenerate oleh admin

### Why This Model
- lebih sederhana untuk MVP
- lebih aman dibanding akses campur bebas
- mudah diaudit
- mudah dioperasikan oleh admin

---

## 3. Goals

### Primary Goals
- Super admin dapat connect 10 akun email atau lebih
- Sistem dapat mengambil OTP otomatis dari semua inbox yang terhubung
- Super admin dapat CRUD user dengan data dasar
- Super admin dapat menentukan user ini menerima OTP dari inbox mana
- Super admin dapat menyalin link akses khusus untuk tiap user
- User dapat melihat OTP hanya dari inbox yang sudah ditetapkan untuk dirinya

### Non Goals
- Tidak ada multi-role selain super admin
- Tidak ada login dashboard untuk user biasa
- Tidak ada claim OTP pada MVP
- Tidak ada SMS OTP

---

## 4. Users

### Super Admin
Memiliki akses penuh untuk:
- login ke dashboard admin
- connect dan manage akun email
- tambah, edit, disable, dan hapus user
- generate, salin, disable, dan regenerate link user
- memantau OTP dari semua inbox

### End User
Hanya memiliki akses untuk:
- membuka link khusus miliknya
- melihat OTP dari inbox yang ditugaskan

End user tidak memiliki akun login admin.

---

## 5. Tech Stack

### Frontend
- Next.js App Router
- TailwindCSS
- shadcn/ui

### Backend
- Next.js Route Handlers / Server Actions
- Vercel Cron

### Database
- Supabase PostgreSQL

### Authentication
- Admin auth only
- Supabase Auth untuk super admin

### Email Integration
- Google Gmail API
- Microsoft Graph API
- OAuth 2.0

### Deployment
- Vercel

---

## 6. Core Features

## 6.1 Admin Authentication

Super admin dapat:
- login ke dashboard
- logout
- mengakses seluruh fitur manajemen sistem

Catatan:
- user admin dibuat dan dikelola dari Supabase Auth
- hanya area admin yang membutuhkan login
- halaman user dengan token tetap tanpa login

---

## 6.2 Inbox Account Management

Super admin dapat:
- connect inbox baru via OAuth
- melihat daftar inbox yang terhubung
- melihat status koneksi inbox
- reconnect jika token bermasalah
- disable inbox

Rules:
- satu inbox dapat digunakan oleh maksimal 3 user
- inbox yang disabled tidak boleh digunakan untuk akses user aktif baru

Data yang ditampilkan:
- provider
- alamat email
- status
- jumlah user terhubung
- last sync

---

## 6.3 User Management

Super admin dapat melakukan CRUD user.

Field user:
- nama
- nomor_hp
- inbox yang ditugaskan
- status user

Rules:
- 1 user wajib punya tepat 1 inbox
- 1 inbox maksimal 3 user aktif
- user aktif tidak boleh tanpa assignment inbox

Status user:
- active
- disabled

Saran operasional:
- disable lebih diutamakan daripada delete

---

## 6.4 User Access Link

Setiap user memiliki link akses unik.

Contoh konsep:

```txt
/u/{secure_token}
```

Admin dapat:
- salin link
- disable link
- regenerate link

Rules:
- link berlaku permanen sampai di-disable atau di-regenerate
- link lama langsung tidak berlaku setelah regenerate
- user disabled tidak boleh membuka link

---

## 6.5 OTP Inbox for Admin

Dashboard admin menampilkan OTP dari semua inbox yang terhubung.

Fitur:
- list OTP terbaru
- filter berdasarkan inbox
- filter berdasarkan provider
- filter sender
- filter subject
- lihat status inbox yang menghasilkan OTP

Field OTP:
- provider
- inbox
- sender
- recipient
- subject
- otp_code
- received_time

---

## 6.6 OTP Page for User

Saat user membuka link khusus:
- sistem mengidentifikasi user berdasarkan token
- sistem memuat inbox yang terhubung ke user tersebut
- sistem hanya menampilkan OTP dari inbox itu

Fitur user page MVP:
- list OTP terbaru
- auto refresh atau refresh berkala
- tampilan sederhana untuk copy OTP

Field OTP:
- sender
- subject
- otp_code
- received_time

---

## 6.7 OTP Extraction Engine

Sistem mengambil email dari provider yang terhubung lalu mengekstrak OTP.

Sumber parsing:
- subject
- plain text body
- html body

Format OTP awal yang didukung:

```txt
123456
654321
AB1234
```

Rules:
- hindari duplikasi berdasarkan provider message id
- simpan hasil ekstraksi ke database

---

## 6.8 Sync Mechanism

MVP menggunakan polling berkala.

Mekanisme:

```txt
Vercel Cron setiap 1 menit
```

Flow:

```txt
Google Gmail API / Microsoft Graph API
-> fetch email terbaru
-> parse OTP
-> simpan ke database
-> tampilkan di dashboard admin dan page user
```

---

## 7. Admin UI Layout

## 7.1 Dashboard Overview

Menampilkan ringkasan:
- total inbox connected
- total user active
- total OTP hari ini
- inbox bermasalah

---

## 7.2 Inbox Management Page

Tabel Inbox:
- provider
- email address
- status
- users connected
- last sync
- actions

Actions:
- connect
- reconnect
- disable

---

## 7.3 User Management Page

Layout:
- bagian atas: form tambah user
- bagian bawah: tabel user

### Form Tambah User
Field:
- nama
- nomor hp
- pilih inbox

Info tambahan:
- tampilkan slot inbox, contoh `2/3 used`

Button:
- tambah user

### Tabel User
Kolom:
- nama
- nomor hp
- provider
- inbox
- status
- link akses
- aksi

Actions:
- salin link
- regenerate link
- disable atau enable
- edit
- hapus

---

## 8. System Architecture

```txt
Google / Microsoft Inbox
-> Provider Adapter
-> Vercel Cron
-> OTP Parser
-> Supabase Database
-> Admin Dashboard
-> User Access Page
```

---

## 9. Database Schema

## mail_accounts

```sql
id
provider
email_address
refresh_token_encrypted
token_expires_at
status
last_checked_at
created_at
updated_at
```

Status:
- active
- reauth_required
- disabled

---

## users

```sql
id
name
phone_number
mail_account_id
access_token_hash
status
link_disabled_at
created_at
updated_at
```

Status:
- active
- disabled

Rule:
- `mail_account_id` wajib terisi

---

## otp_messages

```sql
id
mail_account_id
provider_message_id
sender
recipient
subject
otp_code
body_preview
received_at
created_at
```

---

## 10. Business Rules

1. Satu user hanya boleh memiliki satu inbox.
2. Satu inbox hanya boleh memiliki maksimal tiga user aktif.
3. User aktif wajib memiliki assignment inbox.
4. Link user aktif terus sampai di-disable atau di-regenerate.
5. Jika link di-regenerate, link lama langsung invalid.
6. Jika user di-disable, link user tidak bisa digunakan.
7. Jika inbox di-disable, OTP dari inbox itu tidak boleh tampil di page user aktif.
8. OTP user page hanya berasal dari inbox yang ditetapkan untuk user tersebut.

---

## 11. API / Route Scope

### Admin

```txt
POST /admin/login
POST /admin/logout
POST /api/providers/google/connect
GET /api/providers/google/callback
POST /api/providers/microsoft/connect
GET /api/providers/microsoft/callback
POST /api/users/create
POST /api/users/update
POST /api/users/disable
POST /api/users/delete
POST /api/users/regenerate-link
GET /api/admin/otp
```

### User Access

```txt
GET /u/[token]
GET /api/access/[token]/otp
```

### Background Sync

```txt
GET /api/cron/sync-inboxes
```

---

## 12. Security

### Required
- OAuth provider dilakukan server-side
- refresh token disimpan terenkripsi
- access token user dibuat random panjang dan tidak mudah ditebak
- token link disimpan dalam bentuk hash di database
- admin route dilindungi auth
- validasi limit user per inbox dilakukan di backend

### Recommended
- log waktu akses terakhir link user
- log IP akses terakhir
- limit jumlah OTP yang ditampilkan di user page

### Forbidden
- menyimpan password akun email
- login via IMAP password
- bypass keamanan provider email

---

## 13. MVP Scope

### Included
- super admin dashboard
- multi provider OAuth
- CRUD user
- assign satu user ke satu inbox
- limit tiga user per inbox
- link akses unik user
- copy, disable, dan regenerate link
- OTP polling via cron
- OTP extraction regex dasar
- admin inbox dashboard
- user OTP page via token link

### Excluded
- multi-role selain super admin
- login untuk user biasa
- claim OTP
- email provider selain Google dan Microsoft
- SMS OTP
- mobile app
- custom websocket infra

---

## 14. Future Improvements

- realtime push tanpa polling
- audit logs lengkap
- pencarian histori OTP
- notifikasi Telegram atau WhatsApp
- page user dengan proteksi tambahan
- analytics per inbox/provider
- auto expiry untuk OTP
