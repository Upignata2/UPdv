// @ts-ignore
import { Pool } from 'pg'
import dns from 'node:dns/promises'
import { URL as NodeURL } from 'node:url'

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

function parseConn() {
  const raw = (process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || '').trim()
  const u = new NodeURL(raw)
  const host = u.hostname
  const port = Number(u.port || '5432')
  return { raw, host, port }
}

function getSupabaseRest() {
  const urlVar = (process.env.SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
  if (urlVar && key) return { base: urlVar.replace(/\/+$/, ''), key }
  const raw = (process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || '').trim()
  if (!raw) return null
  try {
    const u = new NodeURL(raw)
    const host = u.hostname.replace(/^db\./, '')
    return { base: `https://${host}`, key }
  } catch {
    return null
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') { res.status(405).send('Método não permitido'); return }
  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
  if (!id) { res.status(400).send('ID inválido'); return }
  try {
    if (String(req.query?.debug||'').toLowerCase() === '1' || String(req.query?.debug||'').toLowerCase() === 'true') {
      const info = parseConn()
      try {
        const r = await dns.lookup(info.host)
        res.status(200).json({ host: info.host, port: info.port, address: r.address, family: r.family })
        return
      } catch (e: any) {
        res.status(500).json({ host: info.host, port: info.port, error: String(e?.message||e) })
        return
      }
    }
    const q = 'SELECT id, name, monthly_price, annual_price, limit_products, limit_customers, coupon, nota, support, promo FROM plans WHERE id=$1'
    const { rows } = await getPool().query(q, [id])
    if (!rows.length) { res.status(404).send('Plano não encontrado'); return }
    const r = rows[0]
    const obj = {
      name: r.name,
      monthlyPrice: Number(r.monthly_price),
      annualPrice: Number(r.annual_price),
      limits: { products: r.limit_products==null?null:Number(r.limit_products), customers: r.limit_customers==null?null:Number(r.limit_customers) },
      features: { coupon: !!r.coupon, nota: !!r.nota, support: String(r.support) },
      promo: r.promo || ''
    }
    res.status(200).json(obj)
  } catch (e: any) {
    const msg = String(e?.message||e)
    try {
      const rest = getSupabaseRest()
      if (rest && rest.key) {
        const url = `${rest.base}/rest/v1/plans?id=eq.${id}&select=id,name,monthly_price,annual_price,limit_products,limit_customers,coupon,nota,support,promo`
        const resp = await fetch(url, { headers: { apikey: rest.key, Authorization: `Bearer ${rest.key}` } })
        if (resp.ok) {
          const rows = await resp.json()
          const r = rows[0]
          if (!r) { res.status(404).send('Plano não encontrado'); return }
          const obj = {
            name: r.name,
            monthlyPrice: Number(r.monthly_price),
            annualPrice: Number(r.annual_price),
            limits: { products: r.limit_products==null?null:Number(r.limit_products), customers: r.limit_customers==null?null:Number(r.limit_customers) },
            features: { coupon: !!r.coupon, nota: !!r.nota, support: String(r.support) },
            promo: r.promo || ''
          }
          res.status(200).json(obj)
          return
        }
      }
    } catch {}
    if (/ENOTFOUND/i.test(msg) || /ECONNREFUSED/i.test(msg) || /500/.test(msg)) {
      // Fallback to hardcoded plans if DB is unreachable
      const defaults: any = {
        gratis: { name: 'Grátis', monthlyPrice: 0, annualPrice: 0, limits: { products: 30, customers: 30 }, features: { coupon: false, nota: false, support: 'none' }, promo: '' },
        basico: { name: 'Básico', monthlyPrice: 19.90, annualPrice: 209.90, limits: { products: 150, customers: 150 }, features: { coupon: true, nota: false, support: 'limited' }, promo: '' },
        elite: { name: 'Elite', monthlyPrice: 39.90, annualPrice: 409.90, limits: { products: null, customers: null }, features: { coupon: true, nota: true, support: 'full' }, promo: 'Recomendado' }
      }
      if (defaults[id]) {
        res.status(200).json(defaults[id])
        return
      }
    }
    res.status(500).send(msg)
  }
}
