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
    const client = await getPool().connect()
    try {
        // Ensure table exists to avoid error on first load
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_config (
                id SERIAL PRIMARY KEY,
                pix_key TEXT,
                pix_name TEXT,
                instructions TEXT,
                mp_access_token TEXT
            )
        `)

        const { rows } = await client.query('SELECT pix_key, pix_name, instructions FROM payment_config LIMIT 1')
        if (rows.length === 0) {
            res.status(200).json({ pixKey: '', pixName: '', instructions: '' })
        } else {
            const r = rows[0]
            res.status(200).json({
                pixKey: r.pix_key || '',
                pixName: r.pix_name || '',
                instructions: r.instructions || ''
                // Do NOT return mp_access_token
            })
        }
    } finally {
        client.release()
    }
  } catch (e: any) {
    console.error(e)
    // Return empty config on error to not break UI
    res.status(200).json({ pixKey: '', pixName: '', instructions: '' })
  }
}
