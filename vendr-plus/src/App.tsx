import React, { useEffect, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

type Route = 'welcome' | 'home' | 'dashboard' | 'products' | 'services' | 'quotes' | 'pos' | 'customers' | 'sales' | 'login' | 'admin'

export function App() {
  const [route, setRoute] = useState<Route>('home')
  const [user, setUser] = useState<{ id: string; name: string; email?: string; role?: 'admin'|'user'; plan?: 'gratis'|'basico'|'elite' } | null>(() => {
    try {
      const raw = localStorage.getItem('updv_auth')
      if (raw) { const obj = JSON.parse(raw); return obj?.user || null }
      const legacy = localStorage.getItem('updv_user')
      return legacy ? JSON.parse(legacy) : null
    } catch { return null }
  })
  const [planConf, setPlanConf] = useState<{ name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string } | null>(null)

  useEffect(() => {
    const hash = (location.hash.replace('#', '') || 'welcome') as Route
    setRoute(hash)
    const onHash = () => setRoute((location.hash.replace('#', '') || 'welcome') as Route)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('updv_auth')
      if (!raw) return
      const obj = JSON.parse(raw)
      if (obj?.token === 'local') { setUser(obj.user); return }
      api<{ id:string; name:string; email?:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' }>(`/auth/me`).then(u=>{
        setUser(u)
      }).catch(()=>{
        setUser(null)
        localStorage.removeItem('updv_auth')
      })
    } catch {}
  }, [])
  useEffect(() => {
    if (user?.plan) {
      api<{ name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string }>(`/plans/${user.plan}`).then(setPlanConf).catch(()=>setPlanConf(null))
    } else {
      setPlanConf(null)
    }
  }, [user?.plan])
  useEffect(() => {
    if (!user && route !== 'login' && route !== 'welcome') { location.hash = '#welcome'; setRoute('welcome') }
  }, [user, route])
  useEffect(() => {
    if (user && (route === 'login' || route === 'welcome')) { location.hash = '#home'; setRoute('home') }
  }, [user, route])
  // remove manual DOM cleanup; modals are controlled by React, and CSS hides any stray .modal without .open

  if (!user) return (route==='welcome'
    ? <Welcome />
    : <Login onLogin={(u)=>{ setUser(u); location.hash = '#home'; setRoute('home') }} />)
  return (
    <div className="layout">
      <aside className="sidebar">
        <Logo />
        <nav className="nav">
          <a href="#home" className={route==='home'?'active':''}>Início</a>
          <a href="#dashboard" className={route==='dashboard'?'active':''}>Dashboard</a>
          <a href="#products" className={route==='products'?'active':''}>Produtos</a>
          <a href="#services" className={route==='services'?'active':''}>Serviços</a>
          <a href="#quotes" className={route==='quotes'?'active':''}>Orçamentos</a>
          <a href="#pos" className={route==='pos'?'active':''}>PDV</a>
          <a href="#customers" className={route==='customers'?'active':''}>Clientes</a>
          <a href="#sales" className={route==='sales'?'active':''}>Vendas</a>
          {user?.role==='admin' && <a href="#admin" className={route==='admin'?'active':''}>Admin</a>}
        </nav>
        <div style={{marginTop:16}}>
          <button className="btn" onClick={async ()=>{ try { await api(`/auth/logout`, { method:'POST' }) } catch {} ; setUser(null); try{ localStorage.removeItem('updv_auth') }catch{}; try{ localStorage.removeItem('updv_user') }catch{}; location.hash = '#welcome'; setRoute('welcome') }}>Sair</button>
        </div>
      </aside>
      <main className="content">
        {route === 'home' && <Home plan={planConf} />}
        {route === 'dashboard' && <Dashboard plan={planConf} />}
        {route === 'products' && <Products user={user!} plan={planConf} />}
        {route === 'services' && <Services />}
        {route === 'quotes' && <Quotes />}
        {route === 'pos' && <POS user={user!} plan={planConf} />}
        {route === 'customers' && <Customers user={user!} plan={planConf} />}
        {route === 'sales' && <Sales />}
        {route === 'admin' && user?.role==='admin' && <Admin />}
      </main>
      <a className="fab" href="#pos">+</a>
    </div>
  )
}

type Product = { id: string; name: string; sku: string; barcode?: string; price: number; stock: number }
type Customer = { id: string; name: string; email?: string }
type SaleItem = { productId: string; qty: number; price: number }
type Sale = { id: string; customerId?: string; items: SaleItem[]; total: number; createdAt: string }
type Service = { id: string; name: string; price: number }
type QuoteItem = { kind: 'product'|'service'; refId: string; qty: number; price: number }
type Quote = { id: string; customerId?: string; items: QuoteItem[]; total: number; createdAt: string; status: 'open'|'converted' }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string,string> = { 'Content-Type': 'application/json' }
  try {
    const raw = localStorage.getItem('updv_auth')
    if (raw) { const obj = JSON.parse(raw); if (obj?.token) headers['Authorization'] = `Bearer ${obj.token}` }
  } catch {}
  const base = (import.meta as any).env?.VITE_API_BASE || '/api'
  const res = await fetch(`${base}${path}`, { headers, ...init })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function Home({ plan }:{ plan: { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string } | null }) {
  const [stats, setStats] = useState<{ today: number; month: number; products: number; customers: number }>()
  useEffect(() => { api<{
    today: number; month: number; products: number; customers: number
  }>(`/stats`).then(setStats).catch(console.error) }, [])
  const goal = 2000
  const progress = Math.min(100, Math.round(((stats?.month||0) / goal) * 100))
  return (
    <div className="grid">
      <div className="tiles">
        <div className="tile primary">
          <div className="label">Vendas no mês</div>
          <div className="value">{formatBRL(stats?.month || 0)}</div>
          <div className="progress"><span style={{width: `${progress}%`}} /></div>
        </div>
        <div className="tile">
          <div className="label">Plano atual</div>
          <div className="value">{plan?.name||'-'}</div>
          <div className="muted">Mensal {formatBRL(plan?.monthlyPrice||0)} • Anual {formatBRL(plan?.annualPrice||0)}</div>
        </div>
        <a className="tile" href="#pos">
          <div className="label">Novo Pedido</div>
          <div className="value">Abrir PDV</div>
        </a>
        <a className="tile" href="#products">
          <div className="label">Produtos</div>
          <div className="value">{stats?.products || 0}</div>
        </a>
        <a className="tile" href="#customers">
          <div className="label">Clientes</div>
          <div className="value">{stats?.customers || 0}</div>
        </a>
        <a className="tile" href="#services">
          <div className="label">Serviços</div>
          <div className="value">Gerenciar</div>
        </a>
        <a className="tile" href="#quotes">
          <div className="label">Orçamentos</div>
          <div className="value">Criar e converter</div>
        </a>
      </div>
    </div>
  )
}

function Welcome() {
  const [plans, setPlans] = useState<Record<string, { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string }>>()
  const [billing, setBilling] = useState<'mensal'|'anual'>('mensal')
  const [more, setMore] = useState<Record<string, boolean>>({})
  useEffect(() => {
    api<Record<string, { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string }>>(`/public/plans`).then(setPlans).catch(()=>{
      setPlans({
        gratis: { name:'Grátis', monthlyPrice:0, annualPrice:0, limits:{ products:80, customers:80 }, features:{ coupon:false, nota:false, support:'none' } },
        basico: { name:'Básico', monthlyPrice:49.9, annualPrice:499, limits:{ products:200, customers:200 }, features:{ coupon:true, nota:true, support:'limited' } },
        elite: { name:'Elite', monthlyPrice:99.9, annualPrice:999, limits:{ products:null, customers:null }, features:{ coupon:true, nota:true, support:'full' } }
      })
    })
  }, [])
  const ids = ['gratis','basico','elite'] as const
  return (
    <div style={{minHeight:'100vh', display:'grid', alignItems:'center', justifyItems:'center', padding:'32px', background:'radial-gradient(circle at 50% 0%, #18181b 0%, #09090b 100%)'}}>
      <div style={{position:'absolute', inset:0, background:'radial-gradient(circle at 80% 20%, rgba(236,72,153,0.15), transparent 40%), radial-gradient(circle at 20% 80%, rgba(219,39,119,0.1), transparent 40%)', pointerEvents:'none'}} />
      <div style={{width:'min(980px, 94vw)', position:'relative', zIndex:1}}>
        <div className="card" style={{padding:'40px', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)', background:'rgba(24,24,27,0.6)', backdropFilter:'blur(12px)'}}>
          <div className="row" style={{alignItems:'center', gap:12, marginBottom:24}}>
            <span style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:48, height:48, borderRadius:14, background:'linear-gradient(135deg, var(--primary), var(--accent))', boxShadow:'0 0 20px rgba(236,72,153,0.4)'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 5h2l2 10h9l2-6H7" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="18" r="2" fill="#ffffff"/>
                <circle cx="16" cy="18" r="2" fill="#ffffff"/>
              </svg>
            </span>
            <div style={{fontWeight:800, fontSize:28, letterSpacing:'-0.03em'}}>UPdv</div>
          </div>
          <div className="h1" style={{fontSize:42, lineHeight:1.1, marginBottom:16}}>Assine um plano e tenha <span style={{color:'var(--primary)'}}>benefícios exclusivos</span></div>
          <div className="muted" style={{fontSize:18, maxWidth:600}}>Adquira o melhor sistema de controle para seu negócio. Simples, rápido e eficiente.</div>
          <div className="row" style={{gap:10, marginTop:32}}>
            <div style={{display:'inline-flex', padding:4, border:'1px solid var(--border)', borderRadius:14, background:'#000'}}>
              <button className="btn" onClick={()=>setBilling('anual')} style={{border:'none', background: billing==='anual' ? 'var(--accent)' : 'transparent', color: billing==='anual' ? '#fff' : 'inherit', boxShadow: billing==='anual' ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'}}>Anual</button>
              <button className="btn" onClick={()=>setBilling('mensal')} style={{border:'none', background: billing==='mensal' ? 'var(--primary)' : 'transparent', color: billing==='mensal' ? '#fff' : 'inherit', boxShadow: billing==='mensal' ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'}}>Mensal</button>
            </div>
            <button className="btn primary" onClick={()=>{ location.hash = '#login' }} style={{padding:'12px 32px', fontSize:16}}>Entrar</button>
          </div>
        </div>
        <div className="card" style={{marginTop:24, textAlign:'center', background:'transparent', border:'none', boxShadow:'none'}}>
          <div className="h1" style={{fontSize:28}}>Estabilidade e agilidade nas suas vendas</div>
          <div className="muted" style={{marginTop:12, fontSize:16, maxWidth:700, marginInline:'auto'}}>Com o nosso Sistema PDV você agiliza suas vendas através de uma plataforma segura e completa.</div>
        </div>
        <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:24, marginTop:32}}>
          {plans && ids.map(pid => {
            const accent = pid==='elite' ? 'linear-gradient(135deg, #fb7185, #f472b6)' : pid==='basico' ? 'linear-gradient(135deg, #ec4899, #f472b6)' : 'linear-gradient(135deg, #52525b, #71717a)'
            const price = billing==='mensal' ? plans[pid].monthlyPrice : plans[pid].annualPrice
            const sup = plans[pid].features.support
            const supLabel = sup==='full' ? 'Suporte completo' : sup==='limited' ? 'Suporte limitado' : 'Sem suporte'
            const limProd = plans[pid].limits.products==null ? 'Ilimitado' : String(plans[pid].limits.products)
            const limCli = plans[pid].limits.customers==null ? 'Ilimitado' : String(plans[pid].limits.customers)
            const popular = pid==='basico'
            const open = !!more[pid]
            return (
              <div key={pid} className="card" style={{position:'relative', overflow:'hidden', border: popular ? '1px solid var(--primary)' : '1px solid var(--border)', transform: popular ? 'scale(1.02)' : 'none'}}>
                <div style={{height:4, width:'100%', background:accent, borderRadius:12, margin:-24, marginBottom:20}} />
                {popular && <span style={{position:'absolute', right:12, top:12}} className="badge">Mais Vendido</span>}
                <div className="h2" style={{marginBottom:8}}>{plans[pid].name}</div>
                <div style={{fontSize:24, fontWeight:800, marginBottom:12}}>{formatBRL(price)}</div>
                <button className="btn primary" onClick={()=>{ location.hash = '#login' }} style={{width:'100%', justifyContent:'center'}}>Comprar Agora</button>
                <div style={{marginTop:12, display:'grid', gap:8}}>
                  <div className="row" style={{gap:8}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span>Produtos {limProd}</span>
                  </div>
                  <div className="row" style={{gap:8}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span>Clientes {limCli}</span>
                  </div>
                  <div className="row" style={{gap:8}}>
                    {plans[pid].features.coupon ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6l-12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/></svg>
                    )}
                    <span>Cupom Fiscal</span>
                  </div>
                  <div className="row" style={{gap:8}}>
                    {plans[pid].features.nota ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6l-12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/></svg>
                    )}
                    <span>Nota Fiscal</span>
                  </div>
                  <div className="row" style={{gap:8}}>
                    {(sup!=='none') ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6l-12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/></svg>
                    )}
                    <span>{supLabel}</span>
                  </div>
                  <button className="btn" onClick={()=>setMore(prev=>({ ...prev, [pid]: !open }))} style={{justifyContent:'space-between'}}>
                    <span>Ver todos os recursos</span>
                    <span style={{transform: open?'rotate(180deg)':'rotate(0deg)'}}>▾</span>
                  </button>
                  {open && (
                    <div className="muted" style={{display:'grid', gap:6}}>
                      <span>Leitura de código de barras</span>
                      <span>Gestão de estoque</span>
                      <span>Cadastro de clientes</span>
                      <span>Serviços e orçamentos</span>
                    </div>
                  )}
                </div>
                {plans[pid].promo && <div className="muted" style={{marginTop:10}}>{plans[pid].promo}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Dashboard({ plan }:{ plan: { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string } | null }) {
  const [stats, setStats] = useState<{ today: number; month: number; products: number; customers: number }>()
  useEffect(() => { api<{
    today: number; month: number; products: number; customers: number
  }>(`/stats`).then(setStats).catch(console.error) }, [])
  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="h2">Resumo</div>
        <div className="row wrap" style={{marginTop:12}}>
          <Stat label="Vendas Hoje" value={formatBRL(stats?.today || 0)} />
          <Stat label="Vendas no Mês" value={formatBRL(stats?.month || 0)} />
          <Stat label="Produtos" value={(stats?.products || 0).toString()} />
          <Stat label="Clientes" value={(stats?.customers || 0).toString()} />
        </div>
      </div>
      <div className="card">
        <div className="h2">Plano</div>
        <div className="row wrap" style={{marginTop:12}}>
          <span className="pill">{plan?.name||'-'}</span>
          <span className="pill">Mensal {formatBRL(plan?.monthlyPrice||0)}</span>
          <span className="pill">Anual {formatBRL(plan?.annualPrice||0)}</span>
          <span className="pill">Cupom {plan?.features?.coupon?'sim':'não'}</span>
          <span className="pill">Nota {plan?.features?.nota?'sim':'não'}</span>
          <span className="pill">Suporte {plan?.features?.support||'none'}</span>
        </div>
      </div>
    </div>
  )
}

function Stat({label, value}:{label:string; value:string}) {
  return <div className="card" style={{minWidth:200}}>
    <div className="h2" style={{marginBottom:8}}>{label}</div>
    <div className="h1">{value}</div>
  </div>
}
function Logo() {
  return (
    <div className="row" style={{alignItems:'center', gap:10, marginBottom:16}}>
      <span style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:12, background:'linear-gradient(135deg, var(--primary), var(--accent))', boxShadow:'0 0 18px rgba(236,72,153,0.4)'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 5h2l2 10h9l2-6H7" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9" cy="18" r="1.6" fill="#ffffff"/>
          <circle cx="16" cy="18" r="1.6" fill="#ffffff"/>
        </svg>
      </span>
      <div style={{fontWeight:700, fontSize:18}}>UPdv</div>
    </div>
  )
}
function Login({ onLogin }:{ onLogin:(user:{ id:string; name:string; email?:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' })=>void }) {
  const [mode, setMode] = useState<'login'|'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const sha = async (s: string) => {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
    } catch {
      let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
      return String(h)
    }
  }

  const submit = async () => {
    if (mode === 'login') {
      if (!(name || email) || !pass) { alert('Informe usuário/e-mail e senha'); return }
      setLoading(true)
      try {
        const res = await api<{ token:string; user:{ id:string; name:string; email:string } }>(`/auth/login`, { method:'POST', body: JSON.stringify({ identifier: email || name, pass }) })
        localStorage.setItem('updv_auth', JSON.stringify(res))
        onLogin(res.user)
      } catch (e:any) {
        try {
          const raw = localStorage.getItem('updv_users')
          const users: { name:string; email:string; pass:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' }[] = raw ? JSON.parse(raw) : []
          const id = (email || name).toLowerCase()
          const user = users.find(u=>u.email.toLowerCase()===id || u.name.toLowerCase()===id)
          if (!user) throw new Error('Usuário não encontrado')
          const hashed = await sha(pass + ':' + user.email)
          if (hashed !== user.pass) throw new Error('Senha inválida')
          const auth = { token: 'local', user: { id: 'local', name: user.name, email: user.email, role: user.role || 'user', plan: user.plan || 'elite' } }
          localStorage.setItem('updv_auth', JSON.stringify(auth))
          onLogin(auth.user)
        } catch (err:any) {
          alert(err?.message||'Falha no login')
        }
      } finally { setLoading(false) }
    } else {
      if (!name || !email || !pass || !confirm) { alert('Preencha todos os campos'); return }
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      if (!emailOk) { alert('E-mail inválido'); return }
      if (pass.length < 6) { alert('Senha deve ter ao menos 6 caracteres'); return }
      if (pass !== confirm) { alert('Senhas não conferem'); return }
      setLoading(true)
      try {
        const res = await api<{ token:string; user:{ id:string; name:string; email:string } }>(`/auth/signup`, { method:'POST', body: JSON.stringify({ name, email, pass }) })
        localStorage.setItem('updv_auth', JSON.stringify(res))
        onLogin(res.user)
      } catch (e:any) {
        try {
          const raw = localStorage.getItem('updv_users')
          const users: { name:string; email:string; pass:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' }[] = raw ? JSON.parse(raw) : []
          if (users.some(u=>u.email.toLowerCase()===email.toLowerCase())) throw new Error('E-mail já cadastrado')
          const hashed = await sha(pass + ':' + email)
          const role: 'admin'|'user' = users.length === 0 ? 'admin' : 'user'
          const plan: 'gratis'|'basico'|'elite' = 'elite'
          users.push({ name, email, pass: hashed, role, plan })
          localStorage.setItem('updv_users', JSON.stringify(users))
          const auth = { token: 'local', user: { id: 'local', name, email, role, plan } }
          localStorage.setItem('updv_auth', JSON.stringify(auth))
          onLogin(auth.user)
        } catch (err:any) {
          alert(err?.message||'Falha no cadastro')
        }
      } finally { setLoading(false) }
    }
  }

  const clearLocal = () => {
    if (window.confirm('Remover usuários locais?')) {
      try {
        localStorage.removeItem('updv_users')
        localStorage.removeItem('updv_auth')
        alert('Usuários locais removidos')
      } catch {
        alert('Falha ao limpar')
      }
    }
  }

  return (
    <div className="modal open">
      <div className="sheet" style={{maxWidth:480}}>
        <div className="row" style={{alignItems:'center', gap:10, marginBottom:16}}>
          <span style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:12, background:'linear-gradient(135deg, var(--primary), var(--accent))', boxShadow:'0 0 18px rgba(236,72,153,0.4)'}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 5h2l2 10h9l2-6H7" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="9" cy="18" r="1.8" fill="#ffffff"/>
              <circle cx="16" cy="18" r="1.8" fill="#ffffff"/>
            </svg>
          </span>
          <div style={{fontWeight:700, fontSize:20}}>UPdv</div>
        </div>
        <div className="grid" style={{gap:12}}>
          {mode === 'login' ? (
            <>
              <input className="input" placeholder="Usuário ou e-mail" value={email||name} onChange={e=>{ const v=e.target.value; if (v.includes('@')) { setEmail(v); setName('') } else { setName(v); setEmail('') } }} />
              <input className="input" placeholder="Senha" type="password" value={pass} onChange={e=>setPass(e.target.value)} />
              <button className="btn primary" onClick={submit} disabled={loading}>Entrar</button>
              <div style={{textAlign:'center'}}>
                <a href="#" onClick={e=>{e.preventDefault(); setMode('signup')}}>Não tem conta? Cadastre-se</a>
              </div>
            </>
          ) : (
            <>
              <input className="input" placeholder="Nome" value={name} onChange={e=>setName(e.target.value)} />
              <input className="input" placeholder="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="input" placeholder="Senha" type="password" value={pass} onChange={e=>setPass(e.target.value)} />
              <input className="input" placeholder="Confirmar senha" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
              <button className="btn primary" onClick={submit} disabled={loading}>Cadastrar</button>
              <div style={{textAlign:'center'}}>
                <a href="#" onClick={e=>{e.preventDefault(); setMode('login')}}>Já tem conta? Entrar</a>
              </div>
            </>
          )}
          <div className="row" style={{marginTop:12, justifyContent:'space-between'}}>
            <button className="btn danger" onClick={clearLocal}>Excluir usuários locais</button>
            <span className="muted">Remove cadastros salvos neste navegador</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Products({ user, plan }:{ user:{ id:string; name:string; email?:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' }; plan: { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string } | null }) {
  const [list, setList] = useState<Product[]>([])
  const [form, setForm] = useState<Partial<Product>>({})
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const load = () => api<Product[]>(`/products`).then(setList)
  useEffect(() => { load().catch(console.error) }, [])

  const save = async () => {
    const lim = plan?.limits?.products==null ? Infinity : plan.limits.products
    if (list.length >= (lim||Infinity)) { alert('Limite de produtos do plano'); return }
    setLoading(true)
    try {
      await api<Product>(`/products`, { method: 'POST', body: JSON.stringify(form) })
      setForm({})
      await load()
    } finally { setLoading(false) }
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="h2">Cadastrar Produto</div>
        <div className="grid cols-2" style={{marginTop:12}}>
          <input className="input" placeholder="Nome" value={form.name||''} onChange={e=>setForm(f=>({...f, name:e.target.value}))} />
          <input className="input" placeholder="SKU" value={form.sku||''} onChange={e=>setForm(f=>({...f, sku:e.target.value}))} />
          <div className="grid" style={{gridTemplateColumns:'1fr auto', gap:12}}>
            <input className="input" placeholder="Código de barras" value={form.barcode||''} onChange={e=>setForm(f=>({...f, barcode:e.target.value}))} />
            <button className="btn" onClick={()=>setScanOpen(true)}>Ler código</button>
          </div>
          {form.barcode && (isValidEAN13(form.barcode) ? <span className="badge">EAN válido</span> : <span className="muted danger">EAN inválido</span>)}
          <input className="input" placeholder="Preço" type="number" value={form.price?.toString()||''} onChange={e=>setForm(f=>({...f, price:Number(e.target.value)}))} />
          <input className="input" placeholder="Estoque" type="number" value={form.stock?.toString()||''} onChange={e=>setForm(f=>({...f, stock:Number(e.target.value)}))} />
          <button className="btn primary" onClick={save} disabled={loading}>Salvar</button>
        </div>
      </div>
      <div className="card">
        <div className="h2">Produtos</div>
        <div className="row" style={{marginTop:12}}>
          <input className="input" placeholder="Buscar por nome ou SKU" value={q} onChange={e=>setQ(e.target.value)} />
          <span className="pill">{list.length} itens</span>
          <span className="pill">Limite {plan?.limits?.products==null?'∞':plan?.limits?.products}</span>
          <span className="pill">Restam {plan?.limits?.products==null?'∞':Math.max(0,(plan!.limits!.products! - list.length))}</span>
        </div>
        <table className="table" style={{marginTop:12}}>
          <thead>
            <tr><th>Nome</th><th>SKU</th><th>Preço</th><th>Estoque</th></tr>
          </thead>
          <tbody>
            {list.filter(p=>!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase())).map(p=> (
              <tr key={p.id}>
                <td>{p.name} {p.stock<=2 && <span className="badge">Baixo estoque</span>}</td>
                <td>{p.sku}</td>
                <td>{formatBRL(p.price)}</td>
                <td>{p.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScanModal open={scanOpen} onClose={()=>setScanOpen(false)} onDetected={(code)=>setForm(f=>({...f, barcode: code}))} title="Ler código de barras" />
    </div>
  )
}

function Customers({ user, plan }:{ user:{ id:string; name:string; email?:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' }; plan: { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string } | null }) {
  const [list, setList] = useState<Customer[]>([])
  const [form, setForm] = useState<Partial<Customer>>({})
  const [loading, setLoading] = useState(false)
  const load = () => api<Customer[]>(`/customers`).then(setList)
  useEffect(() => { load().catch(console.error) }, [])
  const save = async () => {
    const lim = plan?.limits?.customers==null ? Infinity : plan.limits.customers
    if (list.length >= (lim||Infinity)) { alert('Limite de clientes do plano'); return }
    setLoading(true)
    try {
      await api<Customer>(`/customers`, { method: 'POST', body: JSON.stringify(form) })
      setForm({})
      await load()
    } finally { setLoading(false) }
  }
  return (
    <div className="grid">
      <div className="card">
        <div className="h2">Cadastrar Cliente</div>
        <div className="grid cols-2" style={{marginTop:12}}>
          <input className="input" placeholder="Nome" value={form.name||''} onChange={e=>setForm(f=>({...f, name:e.target.value}))} />
          <input className="input" placeholder="Email" value={form.email||''} onChange={e=>setForm(f=>({...f, email:e.target.value}))} />
          <button className="btn primary" onClick={save} disabled={loading}>Salvar</button>
        </div>
      </div>
      <div className="card">
        <div className="h2">Clientes</div>
        <div className="row" style={{marginTop:12}}>
          <span className="pill">Limite {plan?.limits?.customers==null?'∞':plan?.limits?.customers}</span>
          <span className="pill">Restam {plan?.limits?.customers==null?'∞':Math.max(0,(plan!.limits!.customers! - list.length))}</span>
        </div>
        <table className="table" style={{marginTop:12}}>
          <thead>
            <tr><th>Nome</th><th>Email</th></tr>
          </thead>
          <tbody>
            {list.map(c=> (
              <tr key={c.id}><td>{c.name}</td><td>{c.email}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function POS({ user, plan }:{ user:{ id:string; name:string; email?:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite' }; plan: { name:string; monthlyPrice:number; annualPrice:number; limits:{ products:number|null; customers:number|null }; features:{ coupon:boolean; nota:boolean; support:'none'|'limited'|'full' }; promo?:string } | null }) {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<SaleItem[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [scanOpen, setScanOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [lastSale, setLastSale] = useState<Sale|null>(null)
  useEffect(() => { api<Product[]>(`/products`).then(setProducts); api<Customer[]>(`/customers`).then(setCustomers) }, [])

  const addToCart = (p: Product) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === p.id)
      if (idx >= 0) { const copy = [...prev]; copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }; return copy }
      return [...prev, { productId: p.id, qty: 1, price: p.price }]
    })
  }
  const tryAddByCode = async (code: string) => {
    const local = products.find(p=>p.barcode===code || p.sku===code)
    if (local) { addToCart(local); return }
    try {
      const p = await api<Product>(`/products/barcode/${encodeURIComponent(code)}`)
      addToCart(p)
    } catch { alert('Produto não encontrado') }
  }
  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0)
  const submit = async () => {
    const sale = await api<Sale>(`/sales`, { method: 'POST', body: JSON.stringify({ customerId, items: cart }) })
    setCart([])
    setLastSale(sale)
  }
  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="h2">Produtos</div>
        <div className="row" style={{marginTop:12}}>
          <input className="input" placeholder="Código de barras ou SKU" value={scanCode} onChange={e=>setScanCode(e.target.value)} />
          <button className="btn" onClick={()=>tryAddByCode(scanCode)}>Adicionar</button>
          <button className="btn" onClick={()=>setScanOpen(true)}>Ler código</button>
        </div>
        <div className="grid" style={{marginTop:12}}>
          {products.map(p => (
            <div key={p.id} className="row" style={{justifyContent:'space-between'}}>
              <div>
                <div style={{fontWeight:600}}>{p.name}</div>
                <div style={{color:'#9ca3af'}}>Estoque: {p.stock}</div>
              </div>
              <div className="row">
                <div style={{marginRight:12}}>{formatBRL(p.price)}</div>
                <button className="btn" onClick={()=>addToCart(p)} disabled={p.stock<=0}>Adicionar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="h2">Carrinho</div>
        <div className="row" style={{marginTop:12}}>
          <span className="pill">Plano {plan?.name||'-'}</span>
          <span className="pill">Cupom {plan?.features?.coupon?'sim':'não'}</span>
          <span className="pill">Nota {plan?.features?.nota?'sim':'não'}</span>
          <span className="pill">Suporte {plan?.features?.support||'none'}</span>
        </div>
        <div className="grid" style={{marginTop:12}}>
          <select className="select" value={customerId} onChange={e=>setCustomerId(e.target.value)}>
            <option value="">Cliente (opcional)</option>
            {customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <table className="table">
            <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
            <tbody>
              {cart.map(item => {
                const p = products.find(pp=>pp.id===item.productId)!; const subtotal = item.qty * item.price
                return (
                  <tr key={item.productId}>
                    <td>{p?.name}</td>
                    <td>{item.qty}</td>
                    <td>{formatBRL(item.price)}</td>
                    <td>{formatBRL(subtotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="row" style={{justifyContent:'space-between'}}>
            <div className="h1">Total {formatBRL(total)}</div>
            <button className="btn primary" onClick={submit} disabled={cart.length===0}>Finalizar Venda</button>
          </div>
          {lastSale && (
            <div className="row" style={{justifyContent:'space-between'}}>
              {plan?.features?.coupon ? (
                <button className="btn" onClick={()=>printFiscal('cupom', lastSale!, products)}>Imprimir Cupom</button>
              ) : (
                <span className="muted">Cupom indisponível no plano</span>
              )}
              {plan?.features?.nota ? (
                <button className="btn" onClick={()=>printFiscal('nota', lastSale!, products)}>Imprimir Nota</button>
              ) : (
                <span className="muted">Nota indisponível no plano</span>
              )}
            </div>
          )}
        </div>
      </div>
      <ScanModal open={scanOpen} onClose={()=>setScanOpen(false)} onDetected={(code)=>{ setScanCode(code); tryAddByCode(code) }} continuous title="Adicionar via leitura" />
    </div>
  )
}

function Sales() {
  const [list, setList] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selected, setSelected] = useState<Sale>()
  useEffect(()=>{ api<Sale[]>(`/sales`).then(setList); api<Product[]>(`/products`).then(setProducts) },[])
  const openDetails = (s: Sale) => { setSelected(s); setDetailsOpen(true) }
  return (
    <div className="card">
      <div className="h2">Vendas</div>
      <table className="table" style={{marginTop:12}}>
        <thead><tr><th>ID</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Data</th><th>Ações</th></tr></thead>
        <tbody>
          {list.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.customerId||'-'}</td>
              <td>{s.items.reduce((sum,i)=>sum+i.qty,0)}</td>
              <td>{formatBRL(s.total)}</td>
              <td>{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
              <td><button className="btn" onClick={()=>openDetails(s)}>Detalhes</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <SaleDetailsModal open={detailsOpen} sale={selected} onClose={()=>setDetailsOpen(false)} products={products} />
    </div>
  )
}

function Admin() {
  const [list, setList] = useState<Array<{ id:string; name:string; email:string; role?:'admin'|'user'; plan?:'gratis'|'basico'|'elite'; active?:boolean; usage:{ products:number; customers:number; sales:number; services:number; quotes:number } }>>([])
  const [metrics, setMetrics] = useState<any>()
  const [logs, setLogs] = useState<Array<{ id:string; ts:string; userId:string|null; method:string; path:string; status:number; dur:number }>>([])
  const [plans, setPlans] = useState<any>()
  const [loading, setLoading] = useState(false)
  const load = async () => {
    const users = await api<typeof list[0][]>(`/admin/users`)
    setList(users)
    const m = await api<any>(`/admin/metrics`)
    setMetrics(m)
    const lg = await api<typeof logs>(`/admin/access-logs?limit=200`)
    setLogs(lg)
    const p = await api<any>(`/admin/plans`)
    setPlans(p)
  }
  useEffect(() => { load().catch(console.error) }, [])
  const setPlan = async (id:string, plan:'gratis'|'basico'|'elite') => { setLoading(true); await api(`/admin/users/${id}/plan`, { method:'POST', body: JSON.stringify({ plan }) }); await load(); setLoading(false) }
  const setStatus = async (id:string, active:boolean) => { setLoading(true); await api(`/admin/users/${id}/status`, { method:'POST', body: JSON.stringify({ active }) }); await load(); setLoading(false) }
  const savePlan = async (id:'gratis'|'basico'|'elite') => { setLoading(true); await api(`/admin/plans/${id}`, { method:'POST', body: JSON.stringify(plans[id]) }); await load(); setLoading(false) }
  return (
    <div className="grid">
      <div className="h1">Administração</div>
      <div className="grid" style={{gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:16}}>
        <div className="tile primary">
          <div className="label">Usuários ativos</div>
          <div className="value">{metrics?.totals?.activeUsers||0} / {metrics?.totals?.users||0}</div>
        </div>
        <div className="tile">
          <div className="label">Acessos hoje</div>
          <div className="value">{metrics?.access?.today||0}</div>
        </div>
        <div className="tile">
          <div className="label">Logins hoje</div>
          <div className="value">{metrics?.access?.logins?.today||0}</div>
        </div>
      </div>
      <div className="grid" style={{gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:16}}>
        <div className="tile">
          <div className="label">Suporte hoje</div>
          <div className="value">{metrics?.support?.today||0}</div>
        </div>
        <div className="tile">
          <div className="label">Suporte na semana</div>
          <div className="value">{metrics?.support?.week||0}</div>
        </div>
        <div className="tile">
          <div className="label">Suporte no mês</div>
          <div className="value">{metrics?.support?.month||0}</div>
        </div>
      </div>
      <div className="card">
        <table className="table" style={{marginTop:12}}>
          <thead>
            <tr><th>Usuário</th><th>Email</th><th>Plano</th><th>Uso</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {list.map(u=> (
              <tr key={u.id}>
                <td>{u.name} {u.role==='admin' && <span className="badge">Admin</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select className="select" value={u.plan||'gratis'} onChange={e=>setPlan(u.id, e.target.value as any)} disabled={loading || u.role==='admin'}>
                    <option value="gratis">Grátis</option>
                    <option value="basico">Básico</option>
                    <option value="elite">Elite</option>
                  </select>
                </td>
                <td>
                  <span className="pill">Produtos: {u.usage.products}</span>{' '}
                  <span className="pill">Clientes: {u.usage.customers}</span>{' '}
                  <span className="pill">Vendas: {u.usage.sales}</span>
                  {metrics?.access?.lastAccess?.[u.id] && <span className="pill">Último acesso: {new Date(metrics.access.lastAccess[u.id]).toLocaleString('pt-BR')}</span>}
                </td>
                <td>{u.active ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <button className="btn" onClick={()=>setStatus(u.id, !u.active)} disabled={loading || u.role==='admin'}>{u.active ? 'Desativar' : 'Ativar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="h2">Planos</div>
        {plans && (
          <table className="table" style={{marginTop:12}}>
            <thead>
              <tr><th>Plano</th><th>Mensal</th><th>Anual</th><th>Limites</th><th>Recursos</th><th>Promo</th><th>Ações</th></tr></thead>
            <tbody>
              {(['gratis','basico','elite'] as const).map(pid => (
                <tr key={pid}>
                  <td>
                    <input className="input" value={plans[pid].name} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], name: e.target.value } }))} />
                  </td>
                  <td>
                    <input className="input" type="number" value={String(plans[pid].monthlyPrice)} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], monthlyPrice: Number(e.target.value) } }))} />
                  </td>
                  <td>
                    <input className="input" type="number" value={String(plans[pid].annualPrice)} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], annualPrice: Number(e.target.value) } }))} />
                  </td>
                  <td>
                    <div className="row">
                      <input className="input" placeholder="Produtos" type="number" value={plans[pid].limits.products==null?'':String(plans[pid].limits.products)} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], limits: { ...prev[pid].limits, products: e.target.value===''? null : Number(e.target.value) } } }))} />
                      <input className="input" placeholder="Clientes" type="number" value={plans[pid].limits.customers==null?'':String(plans[pid].limits.customers)} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], limits: { ...prev[pid].limits, customers: e.target.value===''? null : Number(e.target.value) } } }))} />
                    </div>
                  </td>
                  <td>
                    <div className="row">
                      <label className="row"><input type="checkbox" checked={!!plans[pid].features.coupon} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], features: { ...prev[pid].features, coupon: e.target.checked } } }))} /> Cupom</label>
                      <label className="row"><input type="checkbox" checked={!!plans[pid].features.nota} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], features: { ...prev[pid].features, nota: e.target.checked } } }))} /> Nota</label>
                      <select className="select" value={plans[pid].features.support} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], features: { ...prev[pid].features, support: e.target.value } } }))}>
                        <option value="none">Sem suporte</option>
                        <option value="limited">Limitado</option>
                        <option value="full">Completo</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <input className="input" placeholder="Promoções/observações" value={plans[pid].promo||''} onChange={e=>setPlans((prev:any)=>({ ...prev, [pid]: { ...prev[pid], promo: e.target.value } }))} />
                  </td>
                  <td>
                    <button className="btn" onClick={()=>savePlan(pid)} disabled={loading}>Salvar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <div className="h2">Logs de Acesso</div>
        <table className="table" style={{marginTop:12}}>
          <thead><tr><th>Data</th><th>Usuário</th><th>Método</th><th>Rota</th><th>Status</th><th>ms</th></tr></thead>
          <tbody>
            {logs.map(l=> {
              const name = list.find(u=>u.id===l.userId)?.name || '-'
              return (
                <tr key={l.id}>
                  <td>{new Date(l.ts).toLocaleString('pt-BR')}</td>
                  <td>{name}</td>
                  <td>{l.method}</td>
                  <td>{l.path}</td>
                  <td>{l.status}</td>
                  <td>{l.dur}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatBRL(v:number) { return v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) }
function Services() {
  const [list, setList] = useState<Service[]>([])
  const [form, setForm] = useState<Partial<Service>>({})
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const load = () => api<Service[]>(`/services`).then(setList)
  useEffect(() => { load().catch(console.error) }, [])
  const save = async () => {
    setLoading(true)
    try {
      await api<Service>(`/services`, { method: 'POST', body: JSON.stringify(form) })
      setForm({})
      await load()
    } finally { setLoading(false) }
  }
  return (
    <div className="grid">
      <div className="card">
        <div className="h2">Cadastrar Serviço</div>
        <div className="grid cols-2" style={{marginTop:12}}>
          <input className="input" placeholder="Nome" value={form.name||''} onChange={e=>setForm(f=>({...f, name:e.target.value}))} />
          <input className="input" placeholder="Preço" type="number" value={form.price?.toString()||''} onChange={e=>setForm(f=>({...f, price:Number(e.target.value)}))} />
          <button className="btn primary" onClick={save} disabled={loading}>Salvar</button>
        </div>
      </div>
      <div className="card">
        <div className="h2">Serviços</div>
        <div className="row" style={{marginTop:12}}>
          <input className="input" placeholder="Buscar serviço" value={q} onChange={e=>setQ(e.target.value)} />
          <span className="pill">{list.length} itens</span>
        </div>
        <table className="table" style={{marginTop:12}}>
          <thead>
            <tr><th>Nome</th><th>Preço</th></tr>
          </thead>
          <tbody>
            {list.filter(s=>!q || s.name.toLowerCase().includes(q.toLowerCase())).map(s=> (
              <tr key={s.id}><td>{s.name}</td><td>{formatBRL(s.price)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Quotes() {
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [items, setItems] = useState<QuoteItem[]>([])
  const [customerId, setCustomerId] = useState('')
  const [list, setList] = useState<Quote[]>([])
  useEffect(() => { api<Product[]>(`/products`).then(setProducts); api<Service[]>(`/services`).then(setServices); api<Customer[]>(`/customers`).then(setCustomers); api<Quote[]>(`/quotes`).then(setList) }, [])
  const addProduct = (p: Product) => setItems(prev=> [...prev, { kind:'product', refId:p.id, qty:1, price:p.price }])
  const addService = (s: Service) => setItems(prev=> [...prev, { kind:'service', refId:s.id, qty:1, price:s.price }])
  const total = items.reduce((acc,i)=> acc + i.qty * i.price, 0)
  const save = async () => {
    const q = await api<Quote>(`/quotes`, { method: 'POST', body: JSON.stringify({ customerId, items }) })
    setItems([])
    const updated = await api<Quote[]>(`/quotes`)
    setList(updated)
    alert(`Orçamento criado: ${q.id}`)
  }
  const convert = async (id: string) => {
    const s = await api<Sale>(`/quotes/${id}/convert`, { method: 'POST' })
    alert(`Orçamento convertido em venda: ${s.id}`)
  }
  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="h2">Novo Orçamento</div>
        <div className="grid" style={{marginTop:12}}>
          <select className="select" value={customerId} onChange={e=>setCustomerId(e.target.value)}>
            <option value="">Cliente (opcional)</option>
            {customers.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="row" style={{justifyContent:'space-between'}}>
            <div style={{fontWeight:600}}>Produtos</div>
            <span className="muted">Clique para adicionar</span>
          </div>
          {products.map(p=> (
            <div key={p.id} className="row" style={{justifyContent:'space-between'}}>
              <div>{p.name}</div>
              <div className="row">
                <div style={{marginRight:12}}>{formatBRL(p.price)}</div>
                <button className="btn" onClick={()=>addProduct(p)}>Adicionar</button>
              </div>
            </div>
          ))}
          <div className="row" style={{justifyContent:'space-between'}}>
            <div style={{fontWeight:600}}>Serviços</div>
            <span className="muted">Clique para adicionar</span>
          </div>
          {services.map(s=> (
            <div key={s.id} className="row" style={{justifyContent:'space-between'}}>
              <div>{s.name}</div>
              <div className="row">
                <div style={{marginRight:12}}>{formatBRL(s.price)}</div>
                <button className="btn" onClick={()=>addService(s)}>Adicionar</button>
              </div>
            </div>
          ))}
          <div className="row" style={{justifyContent:'space-between'}}>
            <div className="h1">Total {formatBRL(total)}</div>
            <button className="btn primary" onClick={save} disabled={items.length===0}>Salvar Orçamento</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="h2">Orçamentos</div>
        <table className="table" style={{marginTop:12}}>
          <thead><tr><th>ID</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {list.map(q=> (
              <tr key={q.id}>
                <td>{q.id}</td>
                <td>{q.customerId||'-'}</td>
                <td>{q.items.reduce((s,i)=> s + i.qty, 0)}</td>
                <td>{formatBRL(q.total)}</td>
                <td>{q.status}</td>
                <td>
                  <button className="btn" onClick={()=>convert(q.id)} disabled={q.status!=='open'}>Converter</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function SaleDetailsModal({open, sale, onClose, products}:{open:boolean; sale?:Sale; onClose:()=>void; products:Product[]}) {
  if (!open || !sale) return null
  const items = sale.items.map(it => {
    const p = products.find(pp=>pp.id===it.productId)
    const subtotal = it.qty * it.price
    return { ...it, name: p?.name || it.productId, subtotal }
  })
  let canPrint = true
  try {
    const raw = localStorage.getItem('updv_auth')
    if (raw) { const obj = JSON.parse(raw); if (obj?.user?.plan === 'gratis') canPrint = false }
  } catch {}
  return (
    <div className="modal open" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="h2">Detalhes da Venda</div>
        <div className="row" style={{marginTop:8, justifyContent:'space-between'}}>
          <span className="pill">ID: {sale.id}</span>
          <span className="muted">{new Date(sale.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        <div className="row" style={{marginTop:6}}>
          <span className="muted">Cliente: {sale.customerId||'-'}</span>
        </div>
        <table className="table" style={{marginTop:12}}>
          <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
          <tbody>
            {items.map((it,i)=> (
              <tr key={i}>
                <td>{it.name}</td>
                <td>{it.qty}</td>
                <td>{formatBRL(it.price)}</td>
                <td>{formatBRL(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{justifyContent:'space-between', marginTop:12}}>
          <div className="h1">Total {formatBRL(sale.total)}</div>
          {canPrint ? (
            <div className="row">
              <button className="btn" onClick={()=>printFiscal('cupom', sale, products)}>Gerar Cupom Fiscal</button>
              <button className="btn primary" onClick={()=>printFiscal('nota', sale, products)}>Gerar Nota Fiscal</button>
            </div>
          ) : (
            <span className="muted">Disponível em planos Básico e Elite</span>
          )}
        </div>
        <div className="row" style={{justifyContent:'flex-end', marginTop:12}}>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
function ScanModal({open, onClose, onDetected, continuous, title}:{open:boolean; onClose:()=>void; onDetected:(code:string)=>void; continuous?:boolean; title?:string}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [last, setLast] = useState<string>('')
  useEffect(() => {
    if (!open) return
    let disposed = false
    BrowserMultiFormatReader.listVideoInputDevices().then((list: MediaDeviceInfo[]) => {
      if (disposed) return
      setDevices(list)
      const prefer = list.find((d: MediaDeviceInfo) => /back|rear|environment/i.test(d.label))?.deviceId || list[0]?.deviceId
      setDeviceId(prev=> prev || prefer || '')
    })
    return () => { disposed = true }
  }, [open])
  useEffect(() => {
    if (!open || !deviceId) return
    const reader = new BrowserMultiFormatReader()
    let disposed = false
    reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result, err) => {
      if (disposed) return
      if (result) {
        const code = result.getText()
        setLast(code)
        try { (navigator as any).vibrate?.(60) } catch {}
        try { beep() } catch {}
        onDetected(code)
        if (!continuous) onClose()
      }
    })
    return () => { disposed = true; const s = videoRef.current?.srcObject as MediaStream | null; s?.getTracks().forEach(t=>t.stop()) }
  }, [open, deviceId, continuous])
  if (!open) return null
  return (
    <div className="modal open" onClick={onClose}>
      <div className="sheet" onClick={e=>e.stopPropagation()}>
        <div className="h2">{title||'Leitura'}</div>
        <div className="row" style={{gap:8, marginBottom:12}}>
          <select className="select" value={deviceId} onChange={e=>setDeviceId(e.target.value)}>
            {devices.map(d=> <option key={d.deviceId} value={d.deviceId}>{d.label||'Câmera'}</option>)}
          </select>
          {last && <span className="pill">Último: {last}</span>}
        </div>
        <video ref={videoRef} style={{width:'100%',borderRadius:12}} muted playsInline />
        <div className="muted">Aproxime o código da câmera</div>
        <div className="row" style={{justifyContent:'space-between',marginTop:12}}>
          <button className="btn" onClick={()=>setLast('')}>Limpar</button>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

function isValidEAN13(code: string) {
  const c = code.replace(/\D/g,'')
  if (c.length !== 13) return false
  const digits = c.split('').map(n=>parseInt(n))
  const check = digits.pop()!
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  const calc = (10 - (sum % 10)) % 10
  return calc === check
}
function printFiscal(kind:'nota'|'cupom', sale: Sale, products: Product[]) {
  const title = kind==='nota' ? 'Nota Fiscal' : 'Cupom Fiscal'
  const date = new Date(sale.createdAt).toLocaleString('pt-BR')
  const rows = sale.items.map(it => {
    const p = products.find(pp=>pp.id===it.productId)
    const name = p?.name || it.productId
    const subtotal = it.qty * it.price
    return `<tr><td>${name}</td><td>${it.qty}</td><td>${formatBRL(it.price)}</td><td>${formatBRL(subtotal)}</td></tr>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${sale.id}</title><style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:28px;background:#ffffff;color:#111} .hd{font-weight:700;font-size:20px;margin-bottom:8px;color:#ec4899} .mut{color:#6b7280} table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border-bottom:1px solid #e5e7eb;padding:8px 10px;text-align:left} .tot{display:flex;justify-content:flex-end;margin-top:16px;font-size:18px;font-weight:700}</style></head><body><div class="hd">${title}</div><div class="mut">ID: ${sale.id}</div><div class="mut">Data: ${date}</div><div class="mut">Cliente: ${sale.customerId||'-'}</div><table><thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table><div class="tot">Total ${formatBRL(sale.total)}</div></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(()=>{ try { w.print() } catch {} }, 300)
}

function beep() {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!AC) return
  const ctx = new AC()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 1000
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  setTimeout(()=>{ osc.stop(); ctx.close() }, 120)
}
