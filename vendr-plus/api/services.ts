// @ts-ignore
import { Pool } from 'pg'

let pool: any
function getPool() {
  const conn = (process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || '').trim()
  if (!conn) throw new Error('Configuração do banco ausente')
  if (!pool) {
    pool = new Pool({
      connectionString: conn,
      ssl: /supabase\.(co|in|net)/.test(conn) ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
    })
  }
  return pool
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const q = 'SELECT id, owner_id, name, price FROM services'
      const { rows } = await getPool().query(q)
      const items = rows.map((r: any) => ({
        id: r.id,
        ownerId: r.owner_id,
        name: r.name,
        price: Number(r.price)
      }))
      res.status(200).json(items)
      return
    }
  } catch (e: any) {
    console.error('Services DB Error (using fallback):', e)
    res.status(200).json([])
  }
}