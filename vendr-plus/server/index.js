import express from 'express'
import cors from 'cors'
import { join } from 'path'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { nanoid } from 'nanoid'
import { randomBytes, createHash } from 'node:crypto'

const dbFile = join(process.cwd(), 'server', 'data', 'db.json')
const adapter = new JSONFile(dbFile)
const defaultPlans = {
  gratis: {
    name: 'Grátis',
    monthlyPrice: 0,
    annualPrice: 0,
    limits: { products: 80, customers: 80 },
    features: { coupon: false, nota: false, support: 'none' },
    promo: ''
  },
  basico: {
    name: 'Básico',
    monthlyPrice: 49.9,
    annualPrice: 499,
    limits: { products: 200, customers: 200 },
    features: { coupon: true, nota: true, support: 'limited' },
    promo: ''
  },
  elite: {
    name: 'Elite',
    monthlyPrice: 99.9,
    annualPrice: 999,
    limits: { products: null, customers: null },
    features: { coupon: true, nota: true, support: 'full' },
    promo: ''
  }
}
const db = new Low(adapter, { products: [], customers: [], services: [], sales: [], quotes: [], users: [], sessions: [], accessLogs: [], supportEvents: [], plans: defaultPlans })
await db.read()
db.data ||= { products: [], customers: [], services: [], sales: [], quotes: [], users: [], sessions: [], accessLogs: [], supportEvents: [], plans: defaultPlans }
if (!db.data.plans) { db.data.plans = defaultPlans; await db.write() }

let pgPool = null
let usePg = false
async function sql(q, params = []) { const r = await pgPool.query(q, params); return r }
async function initPg() {
  await sql(`create table if not exists users (id text primary key, name text not null, email text not null unique, salt text not null, pass text not null, role text not null, plan text not null, active boolean not null)`)
  await sql(`create table if not exists sessions (token text primary key, userId text not null, expiresAt timestamptz not null)`)
  await sql(`create table if not exists plans (id text primary key, name text not null, monthlyPrice numeric not null, annualPrice numeric not null, limits jsonb not null, features jsonb not null, promo text)`)
  await sql(`create table if not exists access_logs (id text primary key, ts timestamptz not null, userId text, method text not null, path text not null, status int not null, dur int not null)`)
  const { rows } = await sql(`select count(*)::int as c from plans`)
  if ((rows[0]?.c||0) === 0) {
    for (const [id, p] of Object.entries(defaultPlans)) {
      await sql(`insert into plans(id,name,monthlyPrice,annualPrice,limits,features,promo) values($1,$2,$3,$4,$5,$6,$7)`, [id, p.name, p.monthlyPrice, p.annualPrice, JSON.stringify(p.limits), JSON.stringify(p.features), p.promo||''])
    }
  }
}
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = await import('pg')
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
    await initPg()
    usePg = true
    console.log('Postgres conectado')
  } catch (e) {
    console.log('Postgres indisponível:', e?.message||String(e))
  }
}

const store = {
  async getUserById(id) {
    if (usePg) { const { rows } = await sql(`select id,name,email,role,plan,active from users where id=$1`, [id]); return rows[0]||null }
    return db.data.users.find(u=>u.id===id)||null
  },
  async getUserByEmailOrName(identifier) {
    if (usePg) { const id = String(identifier).toLowerCase(); const { rows } = await sql(`select * from users where lower(email)=$1 or lower(name)=$1`, [id]); return rows[0]||null }
    const id = String(identifier).toLowerCase(); return db.data.users.find(u=>u.email.toLowerCase()===id || u.name.toLowerCase()===id)||null
  },
  async insertUser(user) {
    if (usePg) { await sql(`insert into users(id,name,email,salt,pass,role,plan,active) values($1,$2,$3,$4,$5,$6,$7,$8)`, [user.id, user.name, user.email, user.salt, user.pass, user.role, user.plan, user.active]); return }
    db.data.users.push(user); await db.write()
  },
  async createSession(userId) {
    if (usePg) { const token = newToken(); const expiresAt = new Date(Date.now()+1000*60*60*8).toISOString(); await sql(`insert into sessions(token,userId,expiresAt) values($1,$2,$3)`, [token, userId, expiresAt]); return token }
    return await createSession(userId)
  },
  async getSession(token) {
    if (!token) return null
    if (usePg) { const { rows } = await sql(`select token,userId,expiresAt from sessions where token=$1`, [token]); const s = rows[0]; if (!s) return null; if (new Date(s.expiresAt).getTime() < Date.now()) { await sql(`delete from sessions where token=$1`, [token]); return null } ; return s }
    return getSession(token)
  },
  async deleteSession(token) {
    if (usePg) { await sql(`delete from sessions where token=$1`, [token]); return }
    const idx = db.data.sessions.findIndex(s=>s.token===token); if (idx>=0) { db.data.sessions.splice(idx,1); await db.write() }
  },
  async getPlans() {
    if (usePg) { const { rows } = await sql(`select * from plans`); const out = {}; for (const r of rows) { out[r.id] = { name: r.name, monthlyPrice: Number(r.monthlyprice)||0, annualPrice: Number(r.annualprice)||0, limits: r.limits, features: r.features, promo: r.promo||'' } } ; return out }
    return db.data.plans
  },
  async getPlanById(id) {
    if (usePg) { const { rows } = await sql(`select * from plans where id=$1`, [id]); const r = rows[0]; if (!r) return null; return { name: r.name, monthlyPrice: Number(r.monthlyprice)||0, annualPrice: Number(r.annualprice)||0, limits: r.limits, features: r.features, promo: r.promo||'' } }
    return db.data.plans[id]||null
  },
  async updatePlan(id, payload) {
    if (usePg) { await sql(`update plans set name=$2, monthlyPrice=$3, annualPrice=$4, limits=$5, features=$6, promo=$7 where id=$1`, [id, payload.name, payload.monthlyPrice, payload.annualPrice, JSON.stringify(payload.limits), JSON.stringify(payload.features), payload.promo||'']); return }
    db.data.plans[id] = payload; await db.write()
  },
  async addAccessLog(log) {
    if (usePg) { await sql(`insert into access_logs(id,ts,userId,method,path,status,dur) values($1,$2,$3,$4,$5,$6,$7)`, [log.id, log.ts, log.userId, log.method, log.path, log.status, log.dur]); return }
    db.data.accessLogs.push(log); if (db.data.accessLogs.length > 5000) db.data.accessLogs.splice(0, db.data.accessLogs.length - 5000); await db.write()
  },
  async listAccessLogs(limit) {
    if (usePg) { const { rows } = await sql(`select id,ts,userId,method,path,status,dur from access_logs order by ts desc limit $1`, [limit]); return rows }
    return db.data.accessLogs.slice(-limit).reverse()
  },
  async listUsers() {
    if (usePg) { const { rows } = await sql(`select id,name,email,role,plan,active from users`); return rows.map(r=>({ id:r.id, name:r.name, email:r.email, role:r.role, plan:r.plan, active:r.active })) }
    return db.data.users.map(u=> ({ id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan, active: u.active }))
  },
  async setUserPlan(id, plan) {
    if (usePg) { await sql(`update users set plan=$2 where id=$1`, [id, plan]); return }
    const u = db.data.users.find(x=>x.id===id); if (u) { u.plan = plan; await db.write() }
  },
  async setUserActive(id, active) {
    if (usePg) { await sql(`update users set active=$2 where id=$1`, [id, !!active]); return }
    const u = db.data.users.find(x=>x.id===id); if (u) { u.active = !!active; await db.write() }
  }
}

const app = express()
app.use(cors())
app.use(express.json())
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', async () => {
    try {
      const token = getAuthToken(req)
      let userId = req.userId || null
      if (!userId && token) { const s = await store.getSession(token); userId = s ? s.userId : null }
      await store.addAccessLog({ id: nanoid(12), ts: new Date().toISOString(), userId, method: req.method, path: req.path, status: res.statusCode, dur: Date.now() - start })
    } catch {}
  })
  next()
})

function hashPassword(pass, salt) {
  return createHash('sha256').update(salt + ':' + pass).digest('hex')
}
function newToken() {
  return randomBytes(24).toString('hex')
}
function getAuthToken(req) {
  const h = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : ''
}
function getSession(token) {
  if (!token) return null
  const s = db.data.sessions.find(ss=>ss.token===token)
  if (!s) return null
  if (new Date(s.expiresAt).getTime() < Date.now()) return null
  return s
}
async function createSession(userId) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + 1000*60*60*8).toISOString()
  db.data.sessions.push({ token, userId, expiresAt })
  await db.write()
  return token
}
async function requireAuth(req, res, next) {
  const token = getAuthToken(req)
  const s = await store.getSession(token)
  if (!s && token !== 'local') return res.status(401).send('Não autorizado')
  req.userId = s ? s.userId : 'local'
  next()
}
async function isAdmin(userId) {
  const u = await store.getUserById(userId)
  return u?.role === 'admin'
}
async function requireAdmin(req, res, next) {
  if (!(await isAdmin(req.userId))) return res.status(403).send('Proibido')
  next()
}

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, pass } = req.body || {}
  if (!name || !email || !pass) return res.status(400).send('Dados inválidos')
  const exists = await store.getUserByEmailOrName(email)
  if (exists) return res.status(400).send('E-mail já cadastrado')
  const salt = randomBytes(16).toString('hex')
  const passHash = hashPassword(String(pass), salt)
  const allUsers = await store.listUsers()
  const isFirst = (allUsers?.length||0) === 0
  const user = { id: nanoid(10), name: String(name), email: String(email), salt, pass: passHash, role: isFirst ? 'admin' : 'user', plan: isFirst ? 'elite' : 'gratis', active: true }
  await store.insertUser(user)
  const token = await store.createSession(user.id)
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan } })
})
app.post('/api/auth/login', async (req, res) => {
  const { identifier, pass } = req.body || {}
  if (!identifier || !pass) return res.status(400).send('Dados inválidos')
  const user = await store.getUserByEmailOrName(identifier)
  if (!user) return res.status(404).send('Usuário não encontrado')
  if (user.active === false) return res.status(403).send('Conta desativada')
  const ok = hashPassword(String(pass), user.salt) === user.pass
  if (!ok) return res.status(401).send('Credenciais inválidas')
  const token = await store.createSession(user.id)
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan } })
})
app.get('/api/auth/me', (req, res) => {
  const t = getAuthToken(req)
  store.getSession(t).then(async s => {
    if (!s) return res.status(401).send('Sessão inválida')
    const user = await store.getUserById(s.userId)
    if (!user) return res.status(404).send('Usuário não encontrado')
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan })
  })
})
app.post('/api/auth/logout', async (req, res) => {
  const token = getAuthToken(req)
  await store.deleteSession(token)
  res.json({ ok: true })
})

app.get('/api/stats', requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0,10)
  const month = new Date().toISOString().slice(0,7)
  const admin = await isAdmin(req.userId)
  const ownSales = admin ? db.data.sales : db.data.sales.filter(s=> s.ownerId===req.userId)
  const salesToday = ownSales.filter(s=> s.createdAt.startsWith(today))
  const salesMonth = ownSales.filter(s=> s.createdAt.startsWith(month))
  const ownProducts = admin ? db.data.products : db.data.products.filter(p=>p.ownerId===req.userId)
  const ownCustomers = admin ? db.data.customers : db.data.customers.filter(c=>c.ownerId===req.userId)
  const sum = (arr)=> arr.reduce((acc,s)=> acc + s.total, 0)
  res.json({ today: sum(salesToday), month: sum(salesMonth), products: ownProducts.length, customers: ownCustomers.length })
})

app.get('/api/products', requireAuth, (req, res) => {
  const items = isAdmin(req.userId) ? db.data.products : db.data.products.filter(p=>p.ownerId===req.userId)
  res.json(items)
})
app.post('/api/products', requireAuth, async (req, res) => {
  const { name, sku, barcode, price, stock } = req.body
  if (!name || price==null || stock==null) return res.status(400).send('Dados inválidos')
  const u = await store.getUserById(req.userId)
  const prodCount = db.data.products.filter(p=>p.ownerId===req.userId).length
  const conf = await store.getPlanById(u?.plan||'gratis') || {}
  const lim = conf?.limits?.products
  if (lim!=null && prodCount >= lim) return res.status(403).send('Limite de produtos do plano')
  const p = { id: nanoid(10), ownerId: req.userId, name, sku: sku||'', barcode: barcode||'', price: Number(price), stock: Number(stock) }
  db.data.products.push(p); await db.write(); res.json(p)
})
app.put('/api/products/:id', requireAuth, async (req, res) => {
  const idx = db.data.products.findIndex(p=>p.id===req.params.id)
  if (idx<0) return res.status(404).send('Produto não encontrado')
  if (!isAdmin(req.userId) && db.data.products[idx].ownerId !== req.userId) return res.status(403).send('Proibido')
  db.data.products[idx] = { ...db.data.products[idx], ...req.body }
  await db.write(); res.json(db.data.products[idx])
})
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const idx = db.data.products.findIndex(p=>p.id===req.params.id)
  if (idx<0) return res.status(404).send('Produto não encontrado')
  if (!isAdmin(req.userId) && db.data.products[idx].ownerId !== req.userId) return res.status(403).send('Proibido')
  const [removed] = db.data.products.splice(idx,1)
  await db.write(); res.json(removed)
})

app.get('/api/products/barcode/:code', requireAuth, (req, res) => {
  const code = req.params.code
  const pool = isAdmin(req.userId) ? db.data.products : db.data.products.filter(p=>p.ownerId===req.userId)
  const p = pool.find(pp=> pp.barcode === code || pp.sku === code)
  if (!p) return res.status(404).send('Produto não encontrado')
  res.json(p)
})

app.get('/api/services', requireAuth, (req, res) => {
  const items = isAdmin(req.userId) ? db.data.services : db.data.services.filter(s=>s.ownerId===req.userId)
  res.json(items)
})
app.post('/api/services', requireAuth, async (req, res) => {
  const { name, price } = req.body
  if (!name || price==null) return res.status(400).send('Dados inválidos')
  const s = { id: nanoid(10), ownerId: req.userId, name, price: Number(price) }
  db.data.services.push(s); await db.write(); res.json(s)
})
app.put('/api/services/:id', requireAuth, async (req, res) => {
  const idx = db.data.services.findIndex(s=>s.id===req.params.id)
  if (idx<0) return res.status(404).send('Serviço não encontrado')
  if (!isAdmin(req.userId) && db.data.services[idx].ownerId !== req.userId) return res.status(403).send('Proibido')
  db.data.services[idx] = { ...db.data.services[idx], ...req.body }
  await db.write(); res.json(db.data.services[idx])
})
app.delete('/api/services/:id', requireAuth, async (req, res) => {
  const idx = db.data.services.findIndex(s=>s.id===req.params.id)
  if (idx<0) return res.status(404).send('Serviço não encontrado')
  if (!isAdmin(req.userId) && db.data.services[idx].ownerId !== req.userId) return res.status(403).send('Proibido')
  const [removed] = db.data.services.splice(idx,1)
  await db.write(); res.json(removed)
})

app.get('/api/customers', requireAuth, (req, res) => {
  const items = isAdmin(req.userId) ? db.data.customers : db.data.customers.filter(c=>c.ownerId===req.userId)
  res.json(items)
})
app.post('/api/customers', requireAuth, async (req, res) => {
  const { name, email } = req.body
  if (!name) return res.status(400).send('Nome obrigatório')
  const u = await store.getUserById(req.userId)
  const custCount = db.data.customers.filter(c=>c.ownerId===req.userId).length
  const conf = await store.getPlanById(u?.plan||'gratis') || {}
  const lim = conf?.limits?.customers
  if (lim!=null && custCount >= lim) return res.status(403).send('Limite de clientes do plano')
  const c = { id: nanoid(10), ownerId: req.userId, name, email: email||'' }
  db.data.customers.push(c); await db.write(); res.json(c)
})

app.get('/api/sales', requireAuth, (req, res) => {
  const items = isAdmin(req.userId) ? db.data.sales : db.data.sales.filter(s=>s.ownerId===req.userId)
  res.json(items)
})
app.post('/api/sales', requireAuth, async (req, res) => {
  const { customerId, items } = req.body
  if (!Array.isArray(items) || items.length===0) return res.status(400).send('Itens obrigatórios')
  let total = 0
  const updates = []
  for (const it of items) {
    const p = db.data.products.find(pp=>pp.id===it.productId)
    if (!p) return res.status(400).send('Produto inválido')
    if (p.stock < it.qty) return res.status(400).send('Estoque insuficiente')
    total += Number(it.qty) * Number(it.price || p.price)
    updates.push({ id: p.id, newStock: p.stock - Number(it.qty) })
  }
  for (const u of updates) {
    const idx = db.data.products.findIndex(p=>p.id===u.id)
    db.data.products[idx].stock = u.newStock
  }
  const sale = { id: nanoid(12), ownerId: req.userId, customerId, items, total, createdAt: new Date().toISOString() }
  db.data.sales.push(sale)
  await db.write()
  res.json(sale)
})

app.get('/api/quotes', requireAuth, (req, res) => {
  const items = isAdmin(req.userId) ? db.data.quotes : db.data.quotes.filter(q=>q.ownerId===req.userId)
  res.json(items)
})
app.post('/api/quotes', requireAuth, async (req, res) => {
  const { customerId, items } = req.body
  if (!Array.isArray(items) || items.length===0) return res.status(400).send('Itens obrigatórios')
  let total = 0
  for (const it of items) {
    if (!['product','service'].includes(it.kind)) return res.status(400).send('Item inválido')
    if (!it.refId || !it.qty) return res.status(400).send('Item incompleto')
    if (it.kind==='product') {
      const p = db.data.products.find(pp=>pp.id===it.refId)
      if (!p) return res.status(400).send('Produto inválido')
      total += Number(it.qty) * Number(it.price || p.price)
    } else {
      const s = db.data.services.find(ss=>ss.id===it.refId)
      if (!s) return res.status(400).send('Serviço inválido')
      total += Number(it.qty) * Number(it.price || s.price)
    }
  }
  const quote = { id: nanoid(12), ownerId: req.userId, customerId, items, total, status: 'open', createdAt: new Date().toISOString() }
  db.data.quotes.push(quote)
  await db.write()
  res.json(quote)
})
app.post('/api/quotes/:id/convert', requireAuth, async (req, res) => {
  const q = db.data.quotes.find(qq=>qq.id===req.params.id)
  if (!q) return res.status(404).send('Orçamento não encontrado')
  if (q.status !== 'open') return res.status(400).send('Orçamento já convertido')
  let total = 0
  const updates = []
  for (const it of q.items) {
    if (it.kind==='product') {
      const p = db.data.products.find(pp=>pp.id===it.refId)
      if (!p) return res.status(400).send('Produto inválido')
      if (p.stock < it.qty) return res.status(400).send('Estoque insuficiente')
      total += Number(it.qty) * Number(it.price || p.price)
      updates.push({ id: p.id, newStock: p.stock - Number(it.qty) })
    } else {
      const s = db.data.services.find(ss=>ss.id===it.refId)
      if (!s) return res.status(400).send('Serviço inválido')
      total += Number(it.qty) * Number(it.price || s.price)
    }
  }
  for (const u of updates) {
    const idx = db.data.products.findIndex(p=>p.id===u.id)
    db.data.products[idx].stock = u.newStock
  }
  const sale = { id: nanoid(12), ownerId: req.userId, customerId: q.customerId, items: q.items.filter(i=>i.kind==='product').map(i=>({ productId: i.refId, qty: i.qty, price: i.price })), total, createdAt: new Date().toISOString() }
  db.data.sales.push(sale)
  q.status = 'converted'
  await db.write()
  res.json(sale)
})

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const mapCount = (ownerId) => ({
    products: db.data.products.filter(p=>p.ownerId===ownerId).length,
    customers: db.data.customers.filter(c=>c.ownerId===ownerId).length,
    sales: db.data.sales.filter(s=>s.ownerId===ownerId).length,
    services: db.data.services.filter(s=>s.ownerId===ownerId).length,
    quotes: db.data.quotes.filter(q=>q.ownerId===ownerId).length,
  })
  const base = await store.listUsers()
  const users = base.map(u=> ({ ...u, usage: mapCount(u.id) }))
  res.json(users)
})
app.get('/api/plans', requireAuth, async (req, res) => { res.json(await store.getPlans()) })
app.get('/api/plans/:id', requireAuth, async (req, res) => { const p = await store.getPlanById(req.params.id); if (!p) return res.status(404).send('Plano não encontrado'); res.json(p) })
app.get('/api/public/plans', async (req, res) => { res.json(await store.getPlans()) })
app.get('/api/admin/plans', requireAuth, requireAdmin, async (req, res) => { res.json(await store.getPlans()) })
app.post('/api/admin/plans/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id
  if (!['gratis','basico','elite'].includes(id)) return res.status(400).send('Plano inválido')
  const payload = req.body || {}
  const curr = await store.getPlanById(id) || {}
  const updated = { ...curr }
  if (Object.prototype.hasOwnProperty.call(payload, 'name')) updated.name = String(payload.name)
  if (Object.prototype.hasOwnProperty.call(payload, 'monthlyPrice')) updated.monthlyPrice = Number(payload.monthlyPrice)
  if (Object.prototype.hasOwnProperty.call(payload, 'annualPrice')) updated.annualPrice = Number(payload.annualPrice)
  if (payload.limits) {
    const pl = payload.limits
    updated.limits = {
      products: pl.products===null ? null : (pl.products==null ? curr.limits?.products ?? null : Number(pl.products)),
      customers: pl.customers===null ? null : (pl.customers==null ? curr.limits?.customers ?? null : Number(pl.customers))
    }
  }
  if (payload.features) {
    const pf = payload.features
    const support = ['none','limited','full'].includes(pf.support) ? pf.support : curr.features?.support || 'none'
    updated.features = { coupon: !!pf.coupon, nota: !!pf.nota, support }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'promo')) updated.promo = String(payload.promo)
  await store.updatePlan(id, updated)
  const resp = await store.getPlanById(id)
  res.json(resp)
})
app.post('/api/admin/users/:id/plan', requireAuth, requireAdmin, async (req, res) => {
  const { plan } = req.body || {}
  if (!['gratis','basico','elite'].includes(plan)) return res.status(400).send('Plano inválido')
  const u = await store.getUserById(req.params.id)
  if (!u) return res.status(404).send('Usuário não encontrado')
  await store.setUserPlan(req.params.id, plan)
  res.json({ ok: true })
})
app.post('/api/admin/users/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const { active } = req.body || {}
  const u = await store.getUserById(req.params.id)
  if (!u) return res.status(404).send('Usuário não encontrado')
  await store.setUserActive(req.params.id, !!active)
  res.json({ ok: true })
})

app.get('/api/admin/access-logs', requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(1000, Number(req.query.limit)||200))
  const logs = await store.listAccessLogs(limit)
  res.json(logs)
})
app.get('/api/admin/metrics', requireAuth, requireAdmin, async (req, res) => {
  const todayStr = new Date().toISOString().slice(0,10)
  const now = Date.now()
  const day = 24*60*60*1000
  const weekAgo = new Date(now - 7*day)
  const monthAgo = new Date(now - 30*day)
  const sup = db.data.supportEvents || []
  const supToday = sup.filter(e=> (e.ts||'').slice(0,10)===todayStr)
  const supWeek = sup.filter(e=> new Date(e.ts).getTime() >= weekAgo.getTime())
  const supMonth = sup.filter(e=> new Date(e.ts).getTime() >= monthAgo.getTime())
  const byType = (arr)=> arr.reduce((acc,e)=>{ acc[e.type] = (acc[e.type]||0) + 1; return acc }, {})
  const logs = await store.listAccessLogs(1000)
  const logsToday = logs.filter(l=> (l.ts||'').slice(0,10)===todayStr)
  const logsWeek = logs.filter(l=> new Date(l.ts).getTime() >= weekAgo.getTime())
  const logsMonth = logs.filter(l=> new Date(l.ts).getTime() >= monthAgo.getTime())
  const loginToday = logsToday.filter(l=> l.path==='/api/auth/login' && l.status===200).length
  const loginWeek = logsWeek.filter(l=> l.path==='/api/auth/login' && l.status===200).length
  const loginMonth = logsMonth.filter(l=> l.path==='/api/auth/login' && l.status===200).length
  const users = await store.listUsers()
  const lastAccess = {}
  for (const l of logs) {
    if (!l.userId) continue
    if (!lastAccess[l.userId] || new Date(l.ts).getTime() > new Date(lastAccess[l.userId]).getTime()) lastAccess[l.userId] = l.ts
  }
  const plans = { gratis: 0, basico: 0, elite: 0 }
  for (const u of users) { if (plans[u.plan]!==undefined) plans[u.plan]++ }
  const activeUsers = users.filter(u=>u.active!==false).length
  res.json({
    totals: { users: users.length, activeUsers, plans },
    support: {
      today: supToday.length,
      week: supWeek.length,
      month: supMonth.length,
      typesToday: byType(supToday),
      typesWeek: byType(supWeek),
      typesMonth: byType(supMonth)
    },
    access: {
      today: logsToday.length,
      week: logsWeek.length,
      month: logsMonth.length,
      logins: { today: loginToday, week: loginWeek, month: loginMonth },
      lastAccess
    }
  })
})
app.get('/api/support/events', requireAuth, requireAdmin, (req, res) => {
  res.json((db.data.supportEvents||[]).slice(-500).reverse())
})
app.post('/api/support/events', requireAuth, requireAdmin, async (req, res) => {
  const { type, channel, note, userId } = req.body || {}
  const ev = { id: nanoid(12), ts: new Date().toISOString(), type: String(type||'issue'), channel: String(channel||'inapp'), note: String(note||''), userId: userId||null }
  db.data.supportEvents.push(ev)
  await db.write()
  res.json(ev)
})

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`API em http://localhost:${port}`))
