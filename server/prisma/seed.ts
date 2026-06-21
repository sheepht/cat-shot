import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.cat.count()
  if (count > 0) {
    console.log(`already has ${count} cats, skip seeding`)
    return
  }
  await prisma.cat.createMany({
    data: [
      { name: '橘貓', breed: 'Tabby', imageUrl: 'https://cataas.com/cat?1' },
      { name: '黑貓', breed: 'Bombay', imageUrl: 'https://cataas.com/cat?2' },
      { name: '三花', breed: 'Calico', imageUrl: 'https://cataas.com/cat?3' },
    ],
  })
  console.log('seeded 3 cats 🐱')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
