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
  if (req.method !== 'GET') { res.status(405).send('Método não permitido'); return }
  try {
    const q = 'SELECT id, name, monthly_price, annual_price, limit_products, limit_customers, coupon, nota, support, promo FROM plans'
    const { rows } = await getPool().query(q)
    const obj: Record<string, any> = {}
    for (const r of rows) {
      obj[r.id] = {
        name: r.name,
        monthlyPrice: Number(r.monthly_price),
        annualPrice: Number(r.annual_price),
        limits: { products: r.limit_products==null?null:Number(r.limit_products), customers: r.limit_customers==null?null:Number(r.limit_customers) },
        features: { coupon: !!r.coupon, nota: !!r.nota, support: String(r.support) },
        promo: r.promo || ''
      }
    }
    res.status(200).json(obj)
  } catch (e: any) {
    res.status(500).send(String(e?.message||e))
  }
}
