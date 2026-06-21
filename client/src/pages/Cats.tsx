import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Cat } from '../lib/api'

export default function Cats() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [breed, setBreed] = useState('')

  const { data: cats, isLoading, isError } = useQuery({
    queryKey: ['cats'],
    queryFn: async () => (await api.get<Cat[]>('/cats')).data,
  })

  const addCat = useMutation({
    mutationFn: async () => (await api.post<Cat>('/cats', { name, breed })).data,
    onSuccess: () => {
      setName('')
      setBreed('')
      qc.invalidateQueries({ queryKey: ['cats'] })
    },
  })

  const delCat = useMutation({
    mutationFn: async (id: number) => api.delete(`/cats/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cats'] }),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">貓咪列表</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) addCat.mutate()
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          className="rounded border px-3 py-2"
          placeholder="名字"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded border px-3 py-2"
          placeholder="品種（選填）"
          value={breed}
          onChange={(e) => setBreed(e.target.value)}
        />
        <button
          type="submit"
          disabled={addCat.isPending}
          className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          新增
        </button>
      </form>

      {isLoading && <p>載入中…</p>}
      {isError && (
        <p className="text-red-600">無法載入，請確認後端與資料庫已啟動。</p>
      )}

      <ul className="space-y-2">
        {cats?.map((cat) => (
          <li
            key={cat.id}
            className="flex items-center justify-between rounded border bg-white px-4 py-3"
          >
            <div>
              <span className="font-medium">{cat.name}</span>
              {cat.breed && (
                <span className="ml-2 text-sm text-slate-500">{cat.breed}</span>
              )}
            </div>
            <button
              onClick={() => delCat.mutate(cat.id)}
              className="text-sm text-red-500 hover:underline"
            >
              刪除
            </button>
          </li>
        ))}
        {cats?.length === 0 && (
          <li className="text-slate-500">還沒有貓咪，新增一隻吧！</li>
        )}
      </ul>
    </div>
  )
}
