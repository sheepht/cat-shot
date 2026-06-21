# Cat Shot 🐱

最小可跑的全端基礎架構，每個技術都用到一點：

| 層 | 技術 |
| --- | --- |
| 前端 | React-TS · Vite · React Router · Axios · React Query · Tailwind CSS |
| 後端 | Hono.js (TypeScript) |
| 資料庫 | PostgreSQL（docker-compose） · Prisma ORM |

## 專案結構

```
cat-shot/
├── docker-compose.yml      # postgres service
├── package.json            # npm workspaces 根
├── client/                 # 前端 (Vite, port 5173)
└── server/                 # 後端 (Hono, port 3001)
```

## 啟動步驟

### 1. 啟動 PostgreSQL（在 Mac host 終端）

```bash
docker compose up -d postgres
```

> devcontainer 內透過 `host.docker.internal:5432` 連到它（見 `server/.env`）。

### 2. 安裝相依套件（devcontainer 內）

```bash
npm install
```

### 3. 建立資料表 + 種子資料

```bash
npm run db:generate   # 產生 Prisma Client
npm run db:setup      # migrate + seed（也可分開 db:migrate / db:seed）
```

### 4. 同時啟動前後端

```bash
npm run dev
```

- 前端： http://localhost:5173
- 後端： http://localhost:3001/api/health

前端的 `/api` 請求會由 Vite proxy 轉發到後端。

## API

| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 健康檢查 |
| GET | `/api/cats` | 列出貓咪 |
| POST | `/api/cats` | 新增貓咪 `{ name, breed?, imageUrl? }` |
| DELETE | `/api/cats/:id` | 刪除貓咪 |
