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
      const q = 'SELECT id, owner_id, name, sku, barcode, price, stock FROM products' // Filter by owner in real app
      const { rows } = await getPool().query(q)
      const items = rows.map((r: any) => ({
        id: r.id,
        ownerId: r.owner_id,
        name: r.name,
        sku: r.sku,
        barcode: r.barcode,
        price: Number(r.price),
        stock: Number(r.stock)
      }))
      res.status(200).json(items)
      return
    }
    // Handle other methods...
  } catch (e: any) {
    // Fallback to mock data if DB fails
    console.error('Products DB Error (using fallback):', e)
    res.status(200).json([]) 
  }
}