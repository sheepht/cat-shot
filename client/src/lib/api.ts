import axios from 'axios'

// 透過 Vite proxy 轉發到 Hono 後端
export const api = axios.create({
  baseURL: '/api',
})

export interface Cat {
  id: number
  name: string
  breed: string | null
  imageUrl: string | null
  createdAt: string
}
