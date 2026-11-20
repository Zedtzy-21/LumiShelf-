import { useState } from 'react'

const TABS = [
  { id: 'reader', label: 'Reader' },
  { id: 'guest', label: 'Guest (5 limits)' },
  { id: 'admin', label: 'Admin' },
]

const inputCls =
  'w-full rounded-xl border border-white/10 bg-[#080B16] px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-[#FFB703] focus:ring-1 focus:ring-[#FFB703]'

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-200">{label}</label>
      {children}
    </div>
  )
}

function PasswordInput({ value, onChange, autoComplete, minLength }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        className={`${inputCls} pr-16`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-[#FFB703]"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

export default function AuthScreen({ onReaderAuth, onAdminLogin, onGuest, onClose }) {
  const [tab, setTab] = useState('reader')
  const [mode, setMode] = useState('signup') // 'signup' | 'signin'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const switchTab = (id) => { setTab(id); setError(''); setInfo('') }

  async function submitReader(event) {
    event.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      const result = await onReaderAuth({ mode, fullName, email: email.trim(), password })
      if (result === 'confirm') setInfo('Account created. Check your email to confirm it, then sign in.')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitAdmin(event) {
    event.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      await onAdminLogin(adminEmail.trim(), adminPassword)
    } catch (err) {
      setError(err.message || 'Administrator sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  const amberBtn =
    'w-full rounded-xl bg-[#FFB703] py-3 text-sm font-bold text-[#13172E] transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0D1A] p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl md:grid-cols-2">
        {/* Left: brand panel */}
        <div className="hidden flex-col justify-between bg-gradient-to-b from-[#431887] via-[#241757] to-[#12152E] p-10 md:flex">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LumiShelf logo" className="h-14 w-14 object-contain" />
            <span className="text-2xl font-extrabold text-[#FFB703]">LumiShelf</span>
          </div>
          <div>
            <h1 className="text-4xl font-extrabold leading-tight text-white">A curated home for timeless literature.</h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Discover and download legally authorized public domain classics, with an AI assistant to help you search and compare.
            </p>
          </div>
          <p className="text-xs text-slate-400">Open-access books · Android &amp; Web</p>
        </div>

        {/* Right: forms */}
        <div className="relative bg-[#0D1120] p-6 sm:p-10">
          {onClose && (
            <button type="button" onClick={onClose} className="absolute right-4 top-4 text-xs font-semibold text-slate-400 hover:text-white">
              ✕ Close
            </button>
          )}

          <div className="mb-6 flex items-center gap-3 md:hidden">
            <img src="/logo.png" alt="LumiShelf logo" className="h-10 w-10 object-contain" />
            <span className="text-xl font-extrabold text-[#FFB703]">LumiShelf</span>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-[#080B16] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={`rounded-xl py-2.5 text-xs font-bold transition sm:text-sm ${
                  tab === t.id ? 'bg-[#1C2242] text-[#FFB703]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</p>}
          {info && <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">{info}</p>}

          {tab === 'reader' && (
            <form onSubmit={submitReader} className="mt-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {mode === 'signup' ? 'Unlock 10 downloads and My Library.' : 'Sign in to continue to LumiShelf.'}
                </p>
              </div>
              {mode === 'signup' && (
                <Field label="Full name">
                  <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={40} autoComplete="name" />
                </Field>
              )}
              <Field label="Email address">
                <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </Field>
              <Field label="Password">
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === 'signup' ? 6 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </Field>
              <button disabled={loading} className={amberBtn}>
                {loading ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
              <p className="text-center text-sm text-slate-400">
                {mode === 'signup' ? 'Already have an account?' : 'New to LumiShelf?'}{' '}
                <button
                  type="button"
                  className="font-semibold text-[#FFB703] hover:underline"
                  onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setInfo('') }}
                >
                  {mode === 'signup' ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </form>
          )}

          {tab === 'guest' && (
            <div className="mt-6">
              <h2 className="text-2xl font-bold text-white">Browse as a guest</h2>
              <p className="mt-1 text-sm text-slate-400">No account needed. Start reading right away.</p>
              <ul className="mt-5 space-y-3 text-sm text-slate-200">
                <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#080B16] px-4 py-3"><span className="font-extrabold text-[#FFB703]">5</span> downloads included</li>
                <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#080B16] px-4 py-3"><span className="font-extrabold text-[#FFB703]">✓</span> Full catalog access</li>
                <li className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#080B16] px-4 py-3"><span className="font-extrabold text-[#FFB703]">✓</span> Lumi AI search</li>
              </ul>
              <button type="button" onClick={onGuest} className={`${amberBtn} mt-6`}>Continue as Guest</button>
              <p className="mt-3 text-center text-xs text-slate-500">Create a free account later to unlock 10 downloads and My Library.</p>
            </div>
          )}

          {tab === 'admin' && (
            <form onSubmit={submitAdmin} className="mt-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Admin Portal Sign In</h2>
                <p className="mt-1 text-sm text-slate-400">Authorized administrators only.</p>
              </div>
              <Field label="Admin Email">
                <input type="email" className={inputCls} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required autoComplete="username" />
              </Field>
              <Field label="Password">
                <PasswordInput value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="current-password" />
              </Field>
              <button disabled={loading} className={amberBtn}>{loading ? 'Verifying…' : 'Sign In as Admin'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}