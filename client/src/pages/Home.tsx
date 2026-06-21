import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

export default function Home() {
  // React Query + Axios 打後端 health check
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get<{ ok: boolean }>('/health')).data,
  })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">基礎架構 Demo</h1>
      <p className="text-slate-600">
        React-TS · React Router · Vite · Hono · Axios · React Query · Tailwind · Prisma · PostgreSQL
      </p>
      <p>
        後端狀態：{' '}
        <span className={data?.ok ? 'text-green-600' : 'text-amber-600'}>
          {data?.ok ? '✅ 連線正常' : '⏳ 連線中…'}
        </span>
      </p>
      <Link
        to="/cats"
        className="inline-block rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
      >
        看貓咪 →
      </Link>
    </div>
  )
}
