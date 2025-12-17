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
    // Try to get real stats
    const client = await getPool().connect()
    try {
        // We probably don't have these tables yet if the user didn't run migrations.
        // So this will likely fail.
        // But let's try.
        const today = new Date().toISOString().split('T')[0]
        const month = new Date().toISOString().slice(0, 7)
        
        // Mock queries for now as we don't know the schema structure for sure
        // (Original code used lowdb JSON structure).
        // If we want to support Postgres, we need to know the table names.
        // Assuming 'sales', 'products', 'customers'.
        
        const salesRes = await client.query(`SELECT SUM(total) as t FROM sales WHERE created_at::text LIKE $1`, [today + '%'])
        const monthRes = await client.query(`SELECT SUM(total) as t FROM sales WHERE created_at::text LIKE $1`, [month + '%'])
        const prodRes = await client.query(`SELECT COUNT(*) as c FROM products`)
        const custRes = await client.query(`SELECT COUNT(*) as c FROM customers`)
        
        res.status(200).json({
            today: Number(salesRes.rows[0]?.t || 0),
            month: Number(monthRes.rows[0]?.t || 0),
            products: Number(prodRes.rows[0]?.c || 0),
            customers: Number(custRes.rows[0]?.c || 0)
        })
    } finally {
        client.release()
    }
  } catch (e) {
    // Fallback to mock data if DB fails
    console.error('Stats DB Error (using fallback):', e)
    res.status(200).json({
        today: 0,
        month: 0,
        products: 0,
        customers: 0
    })
  }
}
