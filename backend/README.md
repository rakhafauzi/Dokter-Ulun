# Dokter Ulun Backend API

Backend Express untuk aplikasi Dokter Ulun yang terhubung ke MySQL dan layanan pendukung seperti Orthanc/PACS.

Panduan deploy end-to-end tersedia di [README-DEPLOY.md](file:///Users/basoro/Server/data/www/dokter-ulun/README-DEPLOY.md).

## Fitur Utama

- autentikasi pengguna
- dashboard data dokter
- data pasien rawat jalan, rawat inap, IGD, hemodialisa
- rekam medis dengan lazy load per tab
- integrasi Orthanc/PACS untuk radiologi
- berkas digital perawatan
- ICD dan simulasi INA-CBG

## Struktur Singkat

```text
backend/
├── config/
│   └── database.js
├── routes/
├── services/
├── .env
├── .env.development.example
├── .env.production.example
├── index.js
├── package.json
└── README.md
```

## Konfigurasi Backend

Titik konfigurasi utama backend:

- [`index.js`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/index.js)
  - membaca `.env`
  - menentukan `PORT`
  - mengatur CORS
- [`config/database.js`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/config/database.js)
  - koneksi MySQL
- [`services/getMedicalRecordService.js`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/services/getMedicalRecordService.js)
  - integrasi Orthanc/PACS
- [`services/digitalFilesService.js`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/services/digitalFilesService.js)
  - URL berkas digital

## Environment Variables

Template env yang tersedia:

- [`backend/.env.example`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/.env.example)
- [`backend/.env.development.example`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/.env.development.example)
- [`backend/.env.production.example`](file:///Users/basoro/Server/data/www/dokter-ulun/backend/.env.production.example)

`backend/.env.example` disiapkan sebagai starter lokal cepat. Untuk server production, gunakan `backend/.env.production.example`.

### Variabel yang Dipakai

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:8080

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=mlite

ORTHANC_SERVER=http://127.0.0.1:8042
ORTHANC_USERNAME=orthanc
ORTHANC_PASSWORD=orthanc

DIGITAL_FILES_BASE_URL=https://simrs.rshdbarabai.com/webapps/berkasrawat
```

Keterangan:

- `PORT`
  - port backend Express
- `FRONTEND_URL`
  - origin frontend yang diizinkan oleh CORS
- `ORTHANC_*`
  - konfigurasi akses ke server Orthanc
- `DIGITAL_FILES_BASE_URL`
  - base URL file digital yang dipakai modal `Berkas Digital`

## Menjalankan Lokal

1. Install dependency:

```bash
cd backend
npm install
```

2. Siapkan env development:

```bash
cp .env.development.example .env
```

3. Sesuaikan nilai database dan layanan pendukung di `.env`

4. Jalankan backend:

```bash
npm run dev
```

5. Backend aktif di:

```text
http://localhost:3000
```

## Menjalankan Production

1. Siapkan env production:

```bash
cp .env.production.example .env
```

2. Jalankan backend:

```bash
npm start
```

3. Atau jalankan sebagai background dengan PM2:

```bash
pm2 start npm --name dokter-ulun-api -- start
pm2 save
```

## Endpoint Penting

### Health

- `GET /health`

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/profile/:username`

### Rekam Medis

- `POST /api/get-medical-record`
- `POST /api/get-medical-record-visit-details`
- `POST /api/get-medical-record-examinations`

### Pasien

- `POST /api/rawat-jalan-patients`
- `POST /api/rawat-inap-data`
- `POST /api/igd-data`
- `POST /api/hemodialisa-data`

### Radiologi dan PACS

- `GET /api/pacs/radiology-images`
- `GET /api/pacs/preview/:instanceId`

### Berkas Digital

- `GET /api/digital-files/:no_rawat`

## Integrasi Dengan Frontend

Skema lokal yang direkomendasikan:

- frontend Vite di `http://localhost:8080`
- backend di `http://localhost:3000`
- Vite proxy `/api` ke backend

Skema production yang direkomendasikan:

- frontend disajikan oleh Nginx
- backend tetap berjalan di port internal, misalnya `3000`
- Nginx melakukan proxy `/api` ke backend

## Contoh Nginx

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Troubleshooting

### Backend tidak bisa diakses

Periksa:

- `PORT` di `.env`
- proses backend benar-benar berjalan
- port tidak dipakai proses lain

### CORS error

Periksa:

- `FRONTEND_URL` di `.env`
- domain frontend yang dipakai browser

### PACS tidak tampil

Periksa:

- `ORTHANC_SERVER`
- `ORTHANC_USERNAME`
- `ORTHANC_PASSWORD`
- akses jaringan dari backend ke server Orthanc

### Berkas digital menampilkan base URL belum dikonfigurasi

Periksa:

- `DIGITAL_FILES_BASE_URL` di `.env`
- backend sudah direstart setelah ubah `.env`
- response `GET /api/digital-files/:no_rawat`

### Query database gagal

Periksa:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

## Debug Cepat

Contoh cek health:

```bash
curl http://127.0.0.1:3000/health
```

Contoh cek digital files:

```bash
curl http://127.0.0.1:3000/api/digital-files/20260510000104
```

Contoh cek debug env berkas digital:

```bash
curl http://127.0.0.1:3000/api/debug/digital-files-env
```
