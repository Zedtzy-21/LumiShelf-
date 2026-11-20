import { useState } from 'react'
import { supabase } from '../Services/supabaseClient'

export default function AuthPage({ onGuest }) {
  const [tab, setTab] = useState('reader') // 'reader' | 'guest'
  const [mode, setMode] = useState('signup') // 'signup' | 'signin'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        if (!data.session) setInfo('Account created. Check your email to confirm, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      // On success the app detects the session and opens the library by itself.
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const tabClass = (active) =>
    `flex-1 rounded-xl py-3 font-semibold transition ${
      active ? 'bg-slate-800 text-amber-400' : 'text-slate-300 hover:text-white'
    }`
  const input =
    'w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-950 p-10 md:flex">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LumiShelf logo" className="h-14 w-14 object-contain" />
            <span className="text-2xl font-extrabold text-amber-400">LumiShelf</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold leading-tight text-white">
              A curated home for timeless literature.
            </h1>
            <p className="mt-4 text-slate-300">
              Discover and download legally authorized public domain classics, with an AI
              assistant to help you search and compare.
            </p>
          </div>
          <p className="text-sm text-slate-400">Open-access books · Android &amp; Web</p>
        </div>

        {/* Form panel */}
        <div className="p-8 md:p-10">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <img src="/logo.png" alt="LumiShelf logo" className="h-10 w-10 object-contain" />
            <span className="text-xl font-extrabold text-amber-400">LumiShelf</span>
          </div>

          <div className="flex gap-1 rounded-2xl border border-white/10 bg-slate-950 p-1">
            <button className={tabClass(tab === 'reader')} onClick={() => setTab('reader')}>
              Reader
            </button>
            <button className={tabClass(tab === 'guest')} onClick={() => setTab('guest')}>
              Guest (5 limits)
            </button>
          </div>

          {tab === 'guest' ? (
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-white">Browse as a guest</h2>
              <p className="mt-3 text-slate-300">
                Start reading right away with no account. Guests can download up to{' '}
                <b className="text-amber-400">5 books</b>. Create a free account later to unlock{' '}
                <b className="text-amber-400">10 downloads</b> and your own My Library.
              </p>
              <button
                onClick={onGuest}
                className="mt-8 w-full rounded-xl bg-amber-400 py-3 font-bold text-slate-950 hover:bg-amber-300"
              >
                Continue as Guest
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                </h2>
                <p className="text-slate-400">
                  {mode === 'signup'
                    ? 'Unlock 10 downloads and My Library.'
                    : 'Sign in to continue to LumiShelf.'}
                </p>
              </div>

              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-red-300">
                  {error}
                </p>
              )}
              {info && (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/50 px-4 py-3 text-emerald-300">
                  {info}
                </p>
              )}

              {mode === 'signup' && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-200">Full name</label>
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-200">Email address</label>
                <input type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-200">Password</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    className={input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-white"
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full rounded-xl bg-amber-400 py-3 font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
              >
                {loading ? 'Please wait…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>

              <p className="text-center text-slate-400">
                {mode === 'signup' ? 'Already have an account?' : 'New to LumiShelf?'}{' '}
                <button
                  type="button"
                  className="font-semibold text-amber-400 hover:underline"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup')
                    setError('')
                    setInfo('')
                  }}
                >
                  {mode === 'signup' ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}