import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const app = new Hono()

app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true }))

// 列出所有貓咪
app.get('/api/cats', async (c) => {
  const cats = await prisma.cat.findMany({ orderBy: { createdAt: 'desc' } })
  return c.json(cats)
})

// 新增一隻貓咪
app.post('/api/cats', async (c) => {
  const body = await c.req.json<{ name?: string; breed?: string; imageUrl?: string }>()
  if (!body?.name?.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  const cat = await prisma.cat.create({
    data: {
      name: body.name.trim(),
      breed: body.breed?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
    },
  })
  return c.json(cat, 201)
})

// 刪除一隻貓咪
app.delete('/api/cats/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
  await prisma.cat.delete({ where: { id } })
  return c.body(null, 204)
})

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🐱 server running on http://localhost:${info.port}`)
})
