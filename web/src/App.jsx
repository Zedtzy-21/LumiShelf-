import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Menu, X, Home, BookOpen, Heart, Download, Shield, Search, Sparkles,
  Sun, Moon, ChevronDown, LogOut, LogIn, ArrowRight, Clock, Flame,
  Send, Scale, Trash2, Loader2, Bot, Minus, Maximize2, Minimize2,
  CheckCircle2, ExternalLink, Plus, Edit3, BookMarked, SlidersHorizontal,
  Pencil, Check, // NEW
} from 'lucide-react'
import { supabase } from './Services/supabaseClient'
import AuthScreen from './Pages/AuthScreen' // NEW

// ============================================================================
// 0. ROOT ERROR BOUNDARY — SHOWS A RECOVERABLE ERROR INSTEAD OF A BLANK PAGE
// ============================================================================
class LumiErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error occurred.',
    }
  }

  componentDidCatch(error, info) {
    console.error('LumiShelf UI Error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#13172E] p-6 text-slate-100">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/35 bg-[#0D1021] p-6 shadow-2xl">
            <h2 className="text-lg font-extrabold text-[#FFB703]">
              LumiShelf Encountered a Display Error
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              LumiShelf caught a rendering error instead of displaying a blank screen.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-red-300">
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-[#FFB703] px-4 py-2 text-xs font-bold text-[#13172E] hover:bg-amber-400"
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ============================================================================
// 1. API, SESSION AND DEVICE CONFIGURATION
// ============================================================================
const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')
const MAX_DOWNLOAD_HISTORY = 25 // NEW: keeps localStorage small

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem('lumishelf_device_id')
    if (!id) {
      id = `guest_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
      localStorage.setItem('lumishelf_device_id', id)
    }
    return id
  } catch {
    return 'guest_device_default'
  }
}

function normalizeBook(book) {
  if (!book) return book
  return {
    ...book,
    category: book.category || book.categories?.name || 'Classic Literature',
    download_url: book.download_url || book.epub_url || null,
  }
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error(`${fallbackMessage} (HTTP ${response.status}; non-JSON response)`)
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || fallbackMessage)
  return data
}

// NEW: the account's saved name, else the first letters of the email (lauren.lina@ub.edu.ph -> Lauren)
function getUserDisplayName(user) {
  if (!user) return 'Guest'
  const saved = String(user.user_metadata?.full_name || '').trim()
  if (saved) return saved
  const local = String(user.email || '').split('@')[0]
  const letters = local.match(/^[a-zA-Z]+/)
  if (!letters) return 'Reader'
  return letters[0].charAt(0).toUpperCase() + letters[0].slice(1).toLowerCase()
}

// NEW
function getInitials(name) {
  const words = String(name || 'Guest').trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || 'GU').slice(0, 2)
  return letters.toUpperCase()
}

// NEW: starts a real browser download for a file link
function triggerFileDownload(url, filename) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// NEW: the LumiShelf logo image
function LumiLogo({ className = 'h-9 w-9' }) {
  return <img src="/logo.png" alt="LumiShelf logo" className={`${className} shrink-0 object-contain`} />
}

// NEW: compact inline name editor (saved on the account)
function EditName({ name, onSave, isDark, compact = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) setDraft(name) }, [name, editing])

  const save = async (event) => {
    event.preventDefault()
    const next = draft.trim().slice(0, 40)
    if (!next || next === name) { setEditing(false); return }
    setSaving(true)
    const ok = await onSave(next)
    setSaving(false)
    if (ok) setEditing(false)
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} aria-label="Edit display name" className={`inline-flex items-center gap-1 font-semibold text-[#FFB703] hover:underline ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <Pencil className="h-3 w-3" />Edit Name
      </button>
    )
  }
  return (
    <form onSubmit={save} className="flex items-center gap-1.5">
      <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={40} aria-label="Display name" className={`w-32 rounded-lg border px-2 py-1 text-xs focus:border-[#FFB703] focus:outline-none ${isDark ? 'border-white/20 bg-[#13172E] text-slate-100' : 'border-slate-300 bg-white text-slate-900'}`} />
      <button type="submit" disabled={saving} aria-label="Save name" className="rounded-lg bg-[#FFB703] p-1.5 text-[#13172E] disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="rounded-lg p-1.5 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
    </form>
  )
}

// ============================================================================
// 2. GLOBAL UI POLISH STYLES
// ============================================================================
function LumiGlobalStyles({ isDark }) {
  return (
    <style>{`
      .lumishelf-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .lumishelf-scroll::-webkit-scrollbar-track { background: ${isDark ? 'rgba(13,16,33,.5)' : 'rgba(226,232,240,.6)'}; }
      .lumishelf-scroll::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255,255,255,.16)' : 'rgba(100,116,139,.35)'}; border-radius: 9999px; }
      .lumishelf-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,183,3,.7); }
    `}</style>
  )
}

// ============================================================================
// 3. BOOK COVER THUMBNAIL WITH GUTENBERG AND INITIALS FALLBACK
// ============================================================================
function BookCoverThumbnail({ book, size = 'card' }) {
  const [fallbackStep, setFallbackStep] = useState(0)
  useEffect(() => setFallbackStep(0), [book?.cover_url, book?.gutenberg_id, book?.title])

  const sizeClasses = {
    sm: 'h-16 w-11 rounded-md',
    md: 'h-24 w-16 rounded-lg',
    lg: 'h-40 w-28 rounded-xl',
    card: 'aspect-[2/3] w-full rounded-xl',
  }[size] || 'h-16 w-11 rounded-md'

  const mirrorCoverUrl = book?.gutenberg_id
    ? `https://gutenberg.pglaf.org/cache/epub/${book.gutenberg_id}/pg${book.gutenberg_id}.cover.medium.jpg`
    : null
  const activeSrc = fallbackStep === 0 && book?.cover_url
    ? book.cover_url
    : fallbackStep <= 1 && mirrorCoverUrl
      ? mirrorCoverUrl
      : null
  const initials = (book?.title || 'LS')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'LS'

  if (activeSrc) {
    return (
      <div className={`${sizeClasses} shrink-0 overflow-hidden border border-white/15 bg-[#1C2242] shadow-sm`}>
        <img src={activeSrc} alt={book?.title || 'Book cover'} loading="lazy" onError={() => setFallbackStep((step) => step + 1)} className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div title={book?.title || 'LumiShelf Edition'} className={`${sizeClasses} relative flex shrink-0 flex-col items-center justify-center overflow-hidden border border-[#FFB703]/35 border-l-4 border-l-[#FFB703] bg-gradient-to-br from-[#1C2242] via-[#13172E] to-[#0A0D1A] p-2 text-center shadow-sm`}>
      <BookOpen className="mb-1 h-5 w-5 text-[#FFB703]" />
      <span className="text-xs font-extrabold tracking-wider text-slate-100">{initials}</span>
      {size === 'card' && <span className="mt-1.5 line-clamp-2 px-1 text-[10px] leading-tight text-slate-300">{book?.title}</span>}
    </div>
  )
}

// ============================================================================
// 4. DOWNLOAD BANNER — AUTO DISMISS AFTER 30 SECONDS
// ============================================================================
function DownloadReadyBanner({ readyBook, onOpenFile, onDismiss, isDark }) {
  useEffect(() => {
    if (!readyBook) return undefined
    const timer = setTimeout(onDismiss, 30000)
    return () => clearTimeout(timer)
  }, [readyBook, onDismiss])

  if (!readyBook) return null
  return (
    <div role="status" className={`mb-5 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md ${isDark ? 'border-emerald-500/40 bg-emerald-950/85 text-emerald-200' : 'border-emerald-500/50 bg-emerald-50 text-emerald-900'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
        <span>“<strong className="font-semibold">{readyBook.title}</strong>” is ready.</span>
        <button type="button" onClick={() => { const target = readyBook; onDismiss(); onOpenFile(target) }} className={`font-bold underline underline-offset-4 ${isDark ? 'text-emerald-300 hover:text-white' : 'text-emerald-700 hover:text-emerald-950'}`}>Open file</button>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="rounded-lg p-1 opacity-75 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
  )
}

// ============================================================================
// 5. IN-APP READER — CHAPTER 1, JUSTIFIED TEXT, CONTINUE-READING PERSISTENCE
// ============================================================================
const isHeadingLine = (p) =>
  p.length < 80 &&
  (/^(chapter|book|part|letter|stave|canto)\b/i.test(p) || (p === p.toUpperCase() && /[A-Z]/.test(p)))

function InAppReaderModal({ book, apiBaseUrl, onClose, onDownload, isDark }) { // CHANGED: onDownload
  const [content, setContent] = useState('')
  const [fallbackMirrorUrl, setFallbackMirrorUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fontIdx, setFontIdx] = useState(1)
  const fontClasses = ['text-sm leading-relaxed', 'text-base leading-relaxed', 'text-lg leading-loose', 'text-xl leading-loose']
  const paragraphs = useMemo(() => content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), [content]) // NEW

  useEffect(() => {
    if (!book?.id) return undefined
    let cancelled = false
    try {
      localStorage.setItem('lumishelf_continue_reading', JSON.stringify({
        id: book.id, title: book.title, author: book.author,
        category: book.category, cover_url: book.cover_url,
        gutenberg_id: book.gutenberg_id, lastReadAt: new Date().toISOString(),
      }))
    } catch { /* Ignore local storage quota errors. */ }

    async function loadBook() {
      setIsLoading(true)
      setContent('')
      setFallbackMirrorUrl(null)
      try {
        const response = await fetch(`${apiBaseUrl}/api/books/${encodeURIComponent(book.id)}/read`)
        const data = await readJsonResponse(response, 'Unable to load this book')
        if (!cancelled) {
          setContent(data.content || book.preview_text || 'Unable to load book content right now.')
          setFallbackMirrorUrl(data.fallbackMirrorUrl || null)
        }
      } catch (error) {
        if (!cancelled) setContent(book.preview_text || `Could not reach LumiShelf reader service: ${error.message}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadBook()
    return () => { cancelled = true }
  }, [book?.id, apiBaseUrl])

  useEffect(() => {
    if (!book) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book, onClose])

  if (!book) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Reading ${book.title}`}>
      <div className={`flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${isDark ? 'border-white/15 bg-[#0F1225] text-slate-100' : 'border-slate-200 bg-amber-50 text-slate-900'}`} onClick={(event) => event.stopPropagation()}>
        <div className={`flex items-center justify-between gap-3 border-b px-5 py-3.5 ${isDark ? 'border-white/10 bg-[#13172E]' : 'border-slate-200 bg-white'}`}>
          <div className="flex min-w-0 items-center gap-3"><BookCoverThumbnail book={book} size="sm" /><div className="min-w-0"><h2 className="line-clamp-1 text-base font-bold">{book.title}</h2><p className={`line-clamp-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{book.author} • LumiShelf Reader</p></div></div>
          <div className="flex shrink-0 items-center gap-2">
            <div className={`flex items-center rounded-lg border p-0.5 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-100'}`}>
              <button type="button" onClick={() => setFontIdx((i) => Math.max(0, i - 1))} disabled={fontIdx === 0} className="rounded-md px-2 py-1 text-xs font-bold hover:bg-black/10 disabled:opacity-35">A-</button>
              <button type="button" onClick={() => setFontIdx((i) => Math.min(fontClasses.length - 1, i + 1))} disabled={fontIdx === fontClasses.length - 1} className="rounded-md px-2 py-1 text-xs font-bold hover:bg-black/10 disabled:opacity-35">A+</button>
            </div>
            {fallbackMirrorUrl && <a href={fallbackMirrorUrl} target="_blank" rel="noopener noreferrer" className={`hidden items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs sm:inline-flex ${isDark ? 'border-white/10 bg-white/5 text-slate-300 hover:text-[#FFB703]' : 'border-slate-200 bg-slate-100 text-slate-700 hover:text-amber-700'}`}>Mirror <ExternalLink className="h-3.5 w-3.5" /></a>}
            <button type="button" onClick={onClose} aria-label="Close reader" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="lumishelf-scroll flex-1 overflow-y-auto px-6 py-8 sm:px-14">
          {isLoading ? (
            <div className="mx-auto max-w-2xl space-y-4 py-8"><div className="flex items-center gap-2 text-sm text-[#FFB703]"><Loader2 className="h-4 w-4 animate-spin" />Preparing Chapter 1...</div>{['w-3/4', 'w-full', 'w-5/6', 'w-full', 'w-2/3'].map((width) => <div key={width} className={`h-4 ${width} animate-pulse rounded bg-current opacity-10`} />)}</div>
          ) : (
            // CHANGED: real paragraphs with justified text instead of one pre-wrapped block
            <article lang="en" className={`mx-auto max-w-2xl font-serif hyphens-auto ${fontClasses[fontIdx]} ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              <p className="mb-6 text-center font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-[#FFB703]">Chapter 1 Preview</p>
              {paragraphs.map((paragraph, index) =>
                isHeadingLine(paragraph)
                  ? <h3 key={index} className="mb-4 mt-8 text-center font-bold tracking-wide">{paragraph}</h3>
                  : <p key={index} className="mt-4 text-justify indent-6">{paragraph}</p>
              )}
              <div className={`mt-10 rounded-2xl border p-5 text-center font-sans ${isDark ? 'border-[#FFB703]/30 bg-[#FFB703]/10' : 'border-amber-300 bg-amber-100/60'}`}>
                <h4 className="text-sm font-extrabold">End of Chapter 1 — Want to keep reading?</h4>
                <p className={`mt-1 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Download the full edition to read it on your own device. This uses one of your downloads.</p>
                <button type="button" onClick={() => onDownload?.(book)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FFB703] px-4 py-2 text-xs font-bold text-[#13172E] hover:bg-amber-400"><Download className="h-3.5 w-3.5" />Download Edition</button>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 6. BOOK DETAILS MODAL — READ, SAVE AND DOWNLOAD ACTIONS
// ============================================================================
function BookDetailModal({ book, isFavorite, onToggleFavorite, onReadBook, onDownloadBook, onClose, isDark }) {
  useEffect(() => {
    if (!book) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book, onClose])
  if (!book) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label={book.title}>
      <div className={`relative w-full max-w-2xl overflow-hidden rounded-2xl border p-6 shadow-2xl sm:p-8 ${isDark ? 'border-white/15 bg-[#13172E] text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`} onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close details" className="absolute right-4 top-4 rounded-lg p-1.5 opacity-70 hover:opacity-100"><X className="h-5 w-5" /></button>
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex flex-col items-center sm:w-44 sm:shrink-0"><BookCoverThumbnail book={book} size="lg" /><div className="mt-4 flex w-full flex-col gap-2">
            <button type="button" onClick={() => { onClose(); onReadBook(book) }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFB703] px-4 py-2.5 text-xs font-bold text-[#13172E] hover:bg-amber-400"><BookOpen className="h-4 w-4" />Read Chapter 1</button>
            <button type="button" onClick={() => onToggleFavorite(book)} className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold ${isFavorite ? 'border-[#FFB703]/50 bg-[#FFB703]/15 text-[#FFB703]' : isDark ? 'border-white/15 bg-white/5 text-slate-200' : 'border-slate-300 bg-slate-50 text-slate-700'}`}><Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />{isFavorite ? 'Saved in Library' : 'Save to Library'}</button>
            <button type="button" onClick={() => onDownloadBook(book)} className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold ${isDark ? 'border-white/15 text-slate-300 hover:border-[#FFB703]/50 hover:text-[#FFB703]' : 'border-slate-300 text-slate-700 hover:border-amber-500'}`}><Download className="h-3.5 w-3.5" />Download Edition</button>
          </div></div>
          <div className="flex-1 space-y-4"><div><span className="inline-flex items-center rounded-full border border-[#FFB703]/30 bg-[#FFB703]/10 px-3 py-0.5 text-xs font-semibold text-[#FFB703]">{book.category || 'Classic Literature'}</span><h2 className="mt-2.5 pr-8 text-2xl font-extrabold leading-snug">{book.title}</h2><p className={`mt-1 text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>by {book.author}</p></div>
            <div className={`flex flex-wrap items-center gap-4 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><span className="inline-flex items-center gap-1 font-medium text-[#FFB703]"><Flame className="h-3.5 w-3.5" />{Number(book.popularity || 0).toLocaleString()} popularity score</span>{book.gutenberg_id && <span>Gutenberg #{book.gutenberg_id}</span>}<span>{book.license || 'Public Domain'} edition</span></div>
            <div className={`rounded-xl border p-4 text-xs leading-relaxed ${isDark ? 'border-white/10 bg-[#1C2242]/60 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><p className="mb-1.5 font-bold uppercase tracking-wider opacity-75">Edition Preview</p><p className="line-clamp-6 whitespace-pre-line">{book.preview_text || `Explore “${book.title}” by ${book.author} in LumiShelf's distraction-free reader, or ask Lumi AI to compare it with other works.`}</p></div>
            <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="opacity-60">Source</dt><dd>{book.source_name || 'Project Gutenberg'}</dd></div><div><dt className="opacity-60">License</dt><dd>{book.license || 'Public Domain'}</dd></div><div><dt className="opacity-60">Language</dt><dd>{(book.language || 'en').toUpperCase()}</dd></div><div><dt className="opacity-60">Format</dt><dd>EPUB</dd></div></dl>
            {book.source_url && <a href={book.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-[#FFB703] hover:underline"><ExternalLink size={16} />Project Gutenberg page</a>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// 7. LUMI AI WIDGET — SAME BACKEND ENDPOINT FOR WEB AND ANDROID
// ============================================================================
const TOOL_BADGE_MAP = {
  search_books: { label: 'Searched Catalog', Icon: Search },
  get_book_details: { label: 'Read Book Details', Icon: BookOpen },
  compare_books: { label: 'Compared Books', Icon: Scale },
  save_book_to_favorites: { label: 'Saved to Library', Icon: Heart },
}
const STARTER_PROMPTS = [ // CHANGED
  'Recommend 2 popular books',
  'Compare top trending books',
  'Save Anna Karenina to my library',
]
const LUMI_FONT_MAP = { sm: 'text-xs leading-relaxed', md: 'text-sm leading-relaxed', lg: 'text-base leading-relaxed' }

function renderCleanMessage(text, fontClass, isDark) {
  if (!text) return null
  const lines = String(text).replace(/^\s*[-*_]{3,}\s*$/gm, '').split('\n').map((line) => line.replace(/^\s*#{1,6}\s+/g, '').replace(/^\s*[\*-]\s+/g, '• '))
  return lines.map((line, lineIdx) => {
    if (!line.trim()) return <div key={lineIdx} className="h-2" />
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return <p key={lineIdx} className={`text-justify ${isDark ? 'text-slate-100' : 'text-slate-800'} ${fontClass}`}>{parts.map((part, partIdx) => part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={partIdx} className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{part.slice(2, -2).replace(/\*/g, '')}</strong> : <span key={partIdx}>{part.replace(/\*/g, '')}</span>)}</p>
  })
}

function LumiAiWidget({ isOpen, setIsOpen, session, apiBaseUrl, onLibraryUpdated, onOpenAuth, isDark }) {
  const [windowMode, setWindowMode] = useState('normal')
  const [fontSizeLevel, setFontSizeLevel] = useState('md')
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const activeFontClass = LUMI_FONT_MAP[fontSizeLevel]

  useEffect(() => { if (isOpen && windowMode !== 'minimized') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isLoading, isOpen, windowMode])
  useEffect(() => {
    if (!isOpen || windowMode === 'minimized') return undefined
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [isOpen, windowMode])

  const sendMessage = async (textToSend) => {
    const trimmed = (textToSend || '').trim()
    if (!trimmed || isLoading) return
    const userMsg = { id: `${Date.now()}-user`, role: 'user', text: trimmed }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInputValue('')
    setIsLoading(true)
    try {
      const history = updatedMessages.slice(-6).map((item) => ({ role: item.role === 'assistant' ? 'model' : 'user', text: item.text }))
      const headers = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const response = await fetch(`${apiBaseUrl}/api/ai/chat`, { method: 'POST', headers, body: JSON.stringify({ message: trimmed, history: history.slice(0, -1) }) })
      const data = await readJsonResponse(response, 'Failed to reach Lumi AI')
      setMessages((prev) => [...prev, { id: `${Date.now()}-assistant`, role: 'assistant', text: data.reply || 'I could not generate a response.', toolsUsed: data.toolsUsed || [], authRequired: Boolean(data.authRequired) }])
      if (data.libraryUpdated && typeof onLibraryUpdated === 'function') await onLibraryUpdated()
    } catch (error) {
      setMessages((prev) => [...prev, { id: `${Date.now()}-error`, role: 'assistant', text: `Sorry, I ran into a connection issue: ${error.message}`, isError: true }])
    } finally {
      setIsLoading(false)
    }
  }

  const close = () => { setIsOpen(false); setWindowMode('normal') }
  if (!isOpen) return <button type="button" onClick={() => { setIsOpen(true); setWindowMode('normal') }} className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-[#FFB703] px-5 py-3.5 text-sm font-bold text-[#13172E] shadow-[0_10px_30px_rgba(255,183,3,.35)] transition-all hover:scale-105 hover:bg-amber-400" aria-label="Ask Lumi AI"><Sparkles className="h-5 w-5" /><span>Ask Lumi AI</span></button>
  if (windowMode === 'minimized') return <div className={`fixed bottom-6 right-6 z-50 flex w-[310px] items-center justify-between rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${isDark ? 'border-white/15 bg-[#0D1021]/95 text-white' : 'border-slate-200 bg-white/95 text-slate-900'}`}><button type="button" onClick={() => setWindowMode('normal')} className="flex items-center gap-2.5 text-left"><span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#FFB703]/30 bg-[#FFB703]/15 text-[#FFB703]"><Bot className="h-4 w-4" /></span><span><span className="block text-xs font-bold">Lumi AI</span><span className="flex items-center gap-1.5 text-[10px] text-emerald-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Connected to Catalog</span></span></button><span className="flex items-center gap-1"><button type="button" onClick={() => setWindowMode('normal')} aria-label="Restore Lumi AI" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><Maximize2 className="h-4 w-4" /></button><button type="button" onClick={close} aria-label="Close Lumi AI" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><X className="h-4 w-4" /></button></span></div>

  const sizeClasses = windowMode === 'maximized' ? 'h-[82vh] w-[720px] max-w-[92vw]' : 'h-[540px] w-[400px] max-w-[calc(100vw-2rem)]'
  return (
    <div role="dialog" aria-label="Lumi AI Chat" className={`fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl transition-all ${sizeClasses} ${isDark ? 'border-white/15 bg-[#13172E]/95 text-slate-100' : 'border-slate-200 bg-white/95 text-slate-900'}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${isDark ? 'border-white/10 bg-[#0D1021]/90' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#FFB703]/30 bg-[#FFB703]/15 text-[#FFB703]"><Bot className="h-5 w-5" /></span><span><strong className="block text-sm">Lumi AI</strong><span className="flex items-center gap-1.5 text-[11px] text-emerald-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Connected to Catalog</span></span></div>
        <div className="flex items-center gap-1"><div className={`mr-0.5 flex items-center rounded-lg border p-0.5 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-100'}`}><button type="button" onClick={() => setFontSizeLevel((p) => p === 'lg' ? 'md' : 'sm')} disabled={fontSizeLevel === 'sm'} className="rounded px-1.5 py-1 text-[11px] font-bold disabled:opacity-35">A-</button><button type="button" onClick={() => setFontSizeLevel((p) => p === 'sm' ? 'md' : 'lg')} disabled={fontSizeLevel === 'lg'} className="rounded px-1.5 py-1 text-[11px] font-bold disabled:opacity-35">A+</button></div><button type="button" onClick={() => setWindowMode('minimized')} aria-label="Minimize Lumi AI" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><Minus className="h-4 w-4" /></button><button type="button" onClick={() => setWindowMode((p) => p === 'maximized' ? 'normal' : 'maximized')} aria-label={windowMode === 'maximized' ? 'Restore Lumi AI' : 'Maximize Lumi AI'} className="rounded-lg p-1.5 opacity-75 hover:opacity-100">{windowMode === 'maximized' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>{messages.length > 0 && <button type="button" onClick={() => { setMessages([]); setInputValue('') }} aria-label="Clear chat" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}<button type="button" onClick={close} aria-label="Close Lumi AI" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><X className="h-5 w-5" /></button></div>
      </div>
      <div className="lumishelf-scroll flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? <div className="flex h-full flex-col justify-between py-2"><div className={`rounded-2xl border p-4 text-center ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'}`}><span className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-[#FFB703]/15 text-[#FFB703]"><Sparkles className="h-6 w-6" /></span><h4 className="text-sm font-semibold">Your Personal Literary Assistant</h4><p className={`mt-1 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Search the catalog, compare books, and save titles to your My Library.</p></div><div className="space-y-2"><p className={`px-1 text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Try asking Lumi AI</p>{STARTER_PROMPTS.map((prompt, index) => <button key={index} type="button" onClick={() => sendMessage(prompt)} className={`w-full rounded-xl border px-3.5 py-2.5 text-left ${activeFontClass} ${isDark ? 'border-white/10 bg-[#1C2242]/70 text-slate-200 hover:border-[#FFB703]/50 hover:text-[#FFB703]' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-500'}`}>“{prompt}”</button>)}</div></div> : messages.map((msg) => <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user' ? 'rounded-br-sm border border-[#FFB703]/40 bg-[#FFB703]/20' : msg.isError ? 'rounded-bl-sm border border-red-500/30 bg-red-500/10 text-red-500' : isDark ? 'rounded-bl-sm border border-white/10 bg-[#1C2242]/90' : 'rounded-bl-sm border border-slate-200 bg-slate-100'}`}>{msg.role !== 'user' && msg.toolsUsed?.length > 0 && <div className="mb-2.5 flex flex-wrap gap-1.5 border-b border-current/10 pb-2">{msg.toolsUsed.map((tool) => { const badge = TOOL_BADGE_MAP[tool]; if (!badge) return null; const Icon = badge.Icon; return <span key={tool} className="inline-flex items-center gap-1 rounded-full border border-[#FFB703]/30 bg-[#FFB703]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FFB703]"><Icon className="h-2.5 w-2.5" />{badge.label}</span> })}</div>}{msg.role === 'user' ? <div className={`whitespace-pre-wrap break-words ${activeFontClass}`}>{msg.text}</div> : <div className="space-y-1.5 break-words">{renderCleanMessage(msg.text, activeFontClass, isDark)}</div>}{msg.authRequired && <div className="mt-3 border-t border-current/10 pt-2.5"><button type="button" onClick={() => { close(); onOpenAuth?.() }} className="inline-flex items-center gap-1.5 rounded-full bg-[#FFB703] px-3.5 py-1.5 text-xs font-bold text-[#13172E]"><LogIn className="h-3.5 w-3.5" />Sign In / Create Account</button></div>}</div></div>)}
        {isLoading && <div className="flex items-start"><div className={`inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-xs ${isDark ? 'border-white/10 bg-[#1C2242]/90 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-600'}`}><Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFB703]" />Lumi AI is responding...</div></div>}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={(event) => { event.preventDefault(); sendMessage(inputValue) }} className={`border-t p-3 ${isDark ? 'border-white/10 bg-[#0D1021]/90' : 'border-slate-200 bg-slate-50'}`}><div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 focus-within:border-[#FFB703] ${isDark ? 'border-white/15 bg-[#13172E]' : 'border-slate-300 bg-white'}`}><input ref={inputRef} value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder="Ask about books or say 'Save Anna Karenina'..." disabled={isLoading} className="flex-1 bg-transparent py-1.5 text-xs focus:outline-none disabled:opacity-50" /><button type="submit" disabled={!inputValue.trim() || isLoading} aria-label="Send message" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFB703] text-[#13172E] hover:bg-amber-400 disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button></div></form>
    </div>
  )
}

// ============================================================================
// 8. ADMIN PANEL — BOOK MANAGEMENT WITH AUTHORIZED CRUD ACTIONS
// ============================================================================
function AdminPanelView({ books = [], session, apiBaseUrl, onBooksChanged, showToast, isDark }) {
  const safeAdminBooks = useMemo(() => (Array.isArray(books) ? books.filter(Boolean) : []), [books])
  const [adminSearch, setAdminSearch] = useState('')
  const [editingBook, setEditingBook] = useState(null)
  const [confirmDeleteBook, setConfirmDeleteBook] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [formData, setFormData] = useState({ title: '', author: '', category: 'Fiction', cover_url: '', epub_url: '', gutenberg_id: '', popularity: 0 })
  const filteredBooks = useMemo(() => {
    const query = adminSearch.trim().toLowerCase()
    if (!query) return safeAdminBooks
    return safeAdminBooks.filter((book) => [book.title, book.author, book.category].some((value) => (value || '').toLowerCase().includes(query)))
  }, [safeAdminBooks, adminSearch])
  const categoryBreakdown = useMemo(() => {
    const counts = {}
    safeAdminBooks.forEach((book) => { const category = book.category || 'Uncategorized'; counts[category] = (counts[category] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [safeAdminBooks])

  const openCreate = () => { setEditingBook(null); setFormData({ title: '', author: '', category: 'Fiction', cover_url: '', epub_url: '', gutenberg_id: '', popularity: 0 }); setIsModalOpen(true) }
  const openEdit = (book) => { setEditingBook(book); setFormData({ title: book.title || '', author: book.author || '', category: book.category || 'Fiction', cover_url: book.cover_url || '', epub_url: book.download_url || book.epub_url || '', gutenberg_id: book.gutenberg_id || '', popularity: book.popularity || 0 }); setIsModalOpen(true) }
  const updateField = (key, value) => setFormData((previous) => ({ ...previous, [key]: value }))

  const handleSave = async (event) => {
    event.preventDefault(); setSaving(true)
    try {
      if (!session?.access_token) throw new Error('Please sign in with an administrator account.')
      const payload = { ...formData, gutenberg_id: formData.gutenberg_id ? Number(formData.gutenberg_id) : null, popularity: Number(formData.popularity) || 0 }
      const url = editingBook ? `${apiBaseUrl}/api/admin/books/${editingBook.id}` : `${apiBaseUrl}/api/admin/books`
      const response = await fetch(url, { method: editingBook ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) })
      const data = await readJsonResponse(response, 'Failed to save book')
      showToast(editingBook ? `Updated “${data.title || formData.title}”` : `Added “${formData.title}” to catalog`)
      setIsModalOpen(false)
      await onBooksChanged()
    } catch (error) { showToast(error.message, 'error') } finally { setSaving(false) }
  }

  const handleDelete = (book) => {
    if (book?.id == null) return
    setConfirmDeleteBook(book)
  }

  const confirmDelete = async () => {
    if (!confirmDeleteBook || deleteBusy) return
    setDeleteBusy(true)
    try {
      if (!session?.access_token) throw new Error('Please sign in with an administrator account.')
      const response = await fetch(`${apiBaseUrl}/api/admin/books/${confirmDeleteBook.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      await readJsonResponse(response, 'Failed to delete book')
      showToast(`Deleted “${confirmDeleteBook.title}”`)
      setConfirmDeleteBook(null)
      await onBooksChanged()
    } catch (error) {
      showToast(error.message || 'Failed to delete book', 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  const cardSurface = isDark ? 'border-white/10 bg-[#1C2242]/75' : 'border-slate-200 bg-white shadow-sm'
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-extrabold tracking-tight">Admin Control Center</h1><p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Catalog analytics, 200-book requirement tracking, and book management</p></div><button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#FFB703] px-4 py-2.5 text-sm font-bold text-[#13172E] hover:bg-amber-400"><Plus className="h-4 w-4" />Add New Book</button></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className={`rounded-2xl border p-5 ${cardSurface}`}><p className="text-xs font-semibold uppercase tracking-wider opacity-70">Total Catalog Books</p><div className="mt-2 flex items-baseline gap-2.5"><span className="text-3xl font-extrabold">{safeAdminBooks.length}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${safeAdminBooks.length >= 200 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[#FFB703]/15 text-[#FFB703]'}`}>{safeAdminBooks.length >= 200 ? '200+ Goal Met' : `${Math.max(0, 200 - safeAdminBooks.length)} to 200`}</span></div><div className={`mt-3 h-1.5 overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full rounded-full bg-[#FFB703]" style={{ width: `${Math.min(100, safeAdminBooks.length / 200 * 100)}%` }} /></div></div><div className={`rounded-2xl border p-5 ${cardSurface}`}><p className="text-xs font-semibold uppercase tracking-wider opacity-70">Active Categories</p><p className="mt-2 text-3xl font-extrabold">{categoryBreakdown.length}</p><p className="text-xs opacity-70">Curated subjects</p></div><div className={`rounded-2xl border p-5 ${cardSurface}`}><p className="text-xs font-semibold uppercase tracking-wider opacity-70">Top Category</p><p className="mt-2 text-2xl font-extrabold text-[#FFB703]">{categoryBreakdown[0]?.[0] || 'Fiction'}</p><p className="text-xs opacity-70">{categoryBreakdown[0]?.[1] || 0} books</p></div></div>
      <div className={`overflow-hidden rounded-2xl border ${cardSurface}`}><div className="border-b border-current/10 p-4"><div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 focus-within:border-[#FFB703] ${isDark ? 'border-white/15 bg-[#0D1021]/80' : 'border-slate-300 bg-slate-50'}`}><Search className="h-4 w-4 opacity-60" /><input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Filter catalog by title, author, or category..." className="w-full bg-transparent text-sm focus:outline-none" /></div></div>
        <div className="lumishelf-scroll overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className={`border-b text-xs uppercase tracking-wider ${isDark ? 'border-white/10 bg-[#0D1021]/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><tr><th className="px-4 py-3">Cover</th><th className="px-4 py-3">Title & Author</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Popularity</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-current/10">{filteredBooks.slice(0, 100).map((book) => <tr key={book.id} className={isDark ? 'hover:bg-white/[.03]' : 'hover:bg-slate-50'}><td className="px-4 py-3"><BookCoverThumbnail book={book} size="sm" /></td><td className="max-w-md px-4 py-3"><div className="line-clamp-1 font-bold" title={book.title}>{book.title}</div><div className={`line-clamp-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{book.author}</div></td><td className="px-4 py-3"><span className="rounded-full border border-[#FFB703]/30 bg-[#FFB703]/10 px-2.5 py-0.5 text-xs font-medium text-[#FFB703]">{book.category || 'Uncategorized'}</span></td><td className="px-4 py-3 font-medium">{Number(book.popularity || 0).toLocaleString()}</td><td className="px-4 py-3 text-right"><div className="inline-flex gap-2"><button type="button" onClick={() => openEdit(book)} className="inline-flex items-center gap-1 rounded-lg border border-[#FFB703]/40 bg-[#FFB703]/10 px-2.5 py-1.5 text-xs font-semibold text-[#FFB703]"><Edit3 className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => handleDelete(book)} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-400"><Trash2 className="h-3.5 w-3.5" />Delete</button></div></td></tr>)}</tbody></table></div>
      </div>
      {confirmDeleteBook && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !deleteBusy && setConfirmDeleteBook(null)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-book-title"
            aria-describedby="delete-book-description"
            onClick={(event) => event.stopPropagation()}
            className={`w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-2xl ${isDark ? 'border-white/15 bg-[#13172E] text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}
          >
            <h3 id="delete-book-title" className="text-lg font-extrabold">Delete Book?</h3>
            <p id="delete-book-description" className="text-sm leading-relaxed opacity-80">
              Are you sure you want to delete <strong>“{confirmDeleteBook.title}”</strong> from the catalog? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteBook(null)}
                disabled={deleteBusy}
                className="rounded-xl border border-current/20 px-4 py-2 text-xs font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? 'Deleting…' : 'Delete Book'}
              </button>
            </div>
          </div>
        </div>
      )}
      {isModalOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}><form onSubmit={handleSave} onClick={(event) => event.stopPropagation()} className={`lumishelf-scroll max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border p-6 shadow-2xl ${isDark ? 'border-white/15 bg-[#13172E] text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}><div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">{editingBook ? 'Edit Book' : 'Add New Book'}</h3><button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg p-1 opacity-70 hover:opacity-100"><X className="h-5 w-5" /></button></div>
        <div className="flex items-center gap-4"><BookCoverThumbnail book={formData} size="md" /><div className="flex-1"><label className="mb-1 block text-xs font-semibold">Cover Image URL</label><input type="url" value={formData.cover_url} onChange={(event) => updateField('cover_url', event.target.value)} placeholder="https://..." className={`w-full rounded-xl border px-3 py-2 text-xs focus:border-[#FFB703] focus:outline-none ${isDark ? 'border-white/15 bg-[#0D1021]' : 'border-slate-300 bg-slate-50'}`} /></div></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[['title', 'Title *'], ['author', 'Author *'], ['category', 'Category'], ['gutenberg_id', 'Gutenberg ID'], ['epub_url', 'EPUB download URL'], ['popularity', 'Popularity']].map(([key, label]) => <div key={key}><label className="mb-1 block text-xs font-semibold">{label}</label><input required={key === 'title' || key === 'author'} type={key === 'gutenberg_id' || key === 'popularity' ? 'number' : key === 'epub_url' ? 'url' : 'text'} min={key === 'gutenberg_id' ? 1 : key === 'popularity' ? 0 : undefined} value={formData[key]} onChange={(event) => updateField(key, event.target.value)} className={`w-full rounded-xl border px-3 py-2 text-xs focus:border-[#FFB703] focus:outline-none ${isDark ? 'border-white/15 bg-[#0D1021]' : 'border-slate-300 bg-slate-50'}`} /></div>)}</div>
        <p className="text-xs opacity-65">Only add books that are public domain or openly licensed.</p><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl border border-current/20 px-4 py-2 text-xs font-semibold">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-[#FFB703] px-5 py-2 text-xs font-bold text-[#13172E] disabled:opacity-50">{saving ? 'Saving...' : editingBook ? 'Save Changes' : 'Add Book'}</button></div></form></div>}
    </div>
  )
}

// ============================================================================
// 9. MAIN LUMISHELF APPLICATION
// ============================================================================
function LumiShelfApp() {
  const [activePage, setActivePage] = useState('home')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('lumishelf_theme') || 'dark' } catch { return 'dark' } })
  const isDark = theme === 'dark'

  const [session, setSession] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(!supabase) // NEW: avoids a login-screen flash on reload
  const [guestMode, setGuestMode] = useState(() => { try { return localStorage.getItem('lumishelf_guest') === '1' } catch { return false } }) // NEW
  const [userRole, setUserRole] = useState('guest')
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const suppressAuthRef = useRef(false) // NEW: pauses session updates while an admin login is being verified

  const [books, setBooks] = useState([])
  const safeBooks = useMemo(() => (Array.isArray(books) ? books.filter(Boolean) : []), [books])
  const [loadingBooks, setLoadingBooks] = useState(true)
  const [favoriteIds, setFavoriteIds] = useState([])
  const [downloadedBookIds, setDownloadedBookIds] = useState([])
  const [quota, setQuota] = useState({ used: 0, limit: 5 })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortBy, setSortBy] = useState('popular')

  const [selectedBook, setSelectedBook] = useState(null)
  const [readingBook, setReadingBook] = useState(null)
  const [readyBook, setReadyBook] = useState(null)
  const [lumiAiOpen, setLumiAiOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [savedContinue, setSavedContinue] = useState(null) // CHANGED: raw saved entry, matched to the catalog below

  const profileDropdownRef = useRef(null)
  const deviceId = useMemo(() => getOrCreateDeviceId(), [])
  const signedIn = Boolean(session?.user)
  const displayName = getUserDisplayName(session?.user) // NEW
  const userInitials = getInitials(displayName) // CHANGED

  const dismissReadyBanner = useCallback(() => setReadyBook(null), []) // NEW: stable function so the 30s timer is not reset

  const showToast = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev.slice(-2), { id, message, type }])
    const timer = setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3500)
    return () => clearTimeout(timer)
  }, [])

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme)
    try { localStorage.setItem('lumishelf_theme', nextTheme) } catch { /* Ignore storage errors. */ }
    showToast(nextTheme === 'dark' ? 'Switched to Dark Mode' : 'Switched to Light Mode')
  }

  // Load the last opened title for the Continue Reading card.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lumishelf_continue_reading')
      setSavedContinue(saved ? JSON.parse(saved) : null)
    } catch { setSavedContinue(null) }
  }, [readingBook, activePage])

  // NEW: match the saved entry against the loaded catalog by id, gutenberg_id, or title
  const continueReadingBook = useMemo(() => {
    if (!savedContinue) return null
    const savedTitle = String(savedContinue.title || '').trim().toLowerCase()
    return (
      safeBooks.find((book) => String(book.id) === String(savedContinue.id)) ||
      (savedContinue.gutenberg_id && safeBooks.find((book) => Number(book.gutenberg_id) === Number(savedContinue.gutenberg_id))) ||
      (savedTitle && safeBooks.find((book) => String(book.title || '').trim().toLowerCase() === savedTitle)) ||
      null
    )
  }, [savedContinue, safeBooks])

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') { setDrawerOpen(false); setProfileMenuOpen(false) } }
    const handleClickOutside = (event) => { if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) setProfileMenuOpen(false) }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => { window.removeEventListener('keydown', handleKeyDown); document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) showToast(error.message, 'error')
      setSession(data?.session || null)
      setSessionChecked(true) // NEW
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted && !suppressAuthRef.current) setSession(nextSession) // CHANGED: respects the admin check
    })
    return () => { mounted = false; listener?.subscription?.unsubscribe() }
  }, [showToast])

  const fetchBooks = useCallback(async () => {
    setLoadingBooks(true)
    try {
      // The API returns at most 100 rows per request. Page until the catalog is complete.
      const pageSize = 100
      const all = []
      for (let offset = 0, page = 0; page < 10; offset += pageSize, page += 1) {
        const response = await fetch(`${API_BASE_URL}/api/books?limit=${pageSize}&offset=${offset}`)
        const pageRows = await readJsonResponse(response, 'Could not load the LumiShelf catalog')
        const rows = Array.isArray(pageRows)
          ? pageRows
          : Array.isArray(pageRows?.books)
            ? pageRows.books
            : []
        all.push(...rows.filter(Boolean).map(normalizeBook))
        if (rows.length < pageSize) break
      }
      setBooks(all)
    } catch (error) {
      console.error('Fetch books error:', error)
      if (supabase) {
        const { data, error: dbError } = await supabase.from('books').select('*, categories(name, slug)').order('popularity', { ascending: false }).limit(1000)
        if (!dbError && Array.isArray(data)) setBooks(data.filter(Boolean).map(normalizeBook))
        else showToast(error.message || dbError?.message || 'Unable to load catalog', 'error')
      } else showToast(error.message, 'error')
    } finally { setLoadingBooks(false) }
  }, [showToast])

  const fetchFavorites = useCallback(async () => {
    if (!supabase || !session?.user?.id) { setFavoriteIds([]); return }
    const { data, error } = await supabase.from('favorites').select('book_id').eq('user_id', session.user.id)
    if (error) { console.error('Favorites query failed:', error.message); return }
    setFavoriteIds((data || []).map((row) => row.book_id))
  }, [session?.user?.id])

  const fetchQuotaAndRole = useCallback(async () => {
    const headers = { 'x-device-id': deviceId }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    try {
      // Current backend exposes /api/user/quota (and /api/usage), not /api/downloads/quota.
      const response = await fetch(`${API_BASE_URL}/api/user/quota`, { headers })
      const data = await readJsonResponse(response, 'Could not retrieve download quota')
      setUserRole(data.role === 'admin' ? 'admin' : session ? 'reader' : 'guest')
      setQuota({ used: Number(data.used || 0), limit: data.limit == null ? null : Number(data.limit) })
    } catch (error) {
      console.error('Quota loading failed:', error.message)
      setUserRole(session ? 'reader' : 'guest')
      setQuota((previous) => ({ used: previous.used, limit: session ? 10 : 5 }))
    }
  }, [session, deviceId])

  useEffect(() => { fetchBooks() }, [fetchBooks])
  useEffect(() => { fetchQuotaAndRole(); fetchFavorites() }, [fetchQuotaAndRole, fetchFavorites])
  useEffect(() => {
    const key = `lumishelf_downloads_${session?.user?.id || deviceId}`
    try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); setDownloadedBookIds(Array.isArray(parsed) ? parsed.slice(0, MAX_DOWNLOAD_HISTORY) : []) }
    catch { setDownloadedBookIds([]) }
  }, [session?.user?.id, deviceId])

  const handleToggleFavorite = async (book) => {
    if (!session?.user?.id || !supabase) { showToast('Sign in to save books to My Library', 'error'); setAuthModalOpen(true); return }
    const exists = favoriteIds.includes(book.id)
    setFavoriteIds((previous) => exists ? previous.filter((id) => id !== book.id) : [...previous, book.id])
    const { error } = exists
      ? await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('book_id', book.id)
      : await supabase.from('favorites').upsert({ user_id: session.user.id, book_id: book.id }, { onConflict: 'user_id,book_id' })
    if (error) { await fetchFavorites(); showToast(error.message, 'error'); return }
    showToast(exists ? `Removed “${book.title}” from My Library` : `Saved “${book.title}” to My Library`)
  }

  // CHANGED: quota check first, then a real EPUB download starts in the browser
  const handleDownloadBook = async (book) => {
    try {
      const headers = { 'Content-Type': 'application/json', 'x-device-id': deviceId }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const response = await fetch(`${API_BASE_URL}/api/books/${book.id}/download`, { method: 'POST', headers })
      const data = await response.json().catch(() => ({}))
      if (response.status === 403 || response.status === 429) { showToast(data.error || 'Download limit reached', 'error'); await fetchQuotaAndRole(); return }
      if (!response.ok) throw new Error(data.error || 'Download failed')
      setQuota((previous) => ({ used: data.used ?? previous.used + 1, limit: data.limit == null ? previous.limit : data.limit }))
      const storageKey = `lumishelf_downloads_${session?.user?.id || deviceId}`
      setDownloadedBookIds((previous) => {
        const next = [book.id, ...previous.filter((id) => id !== book.id)].slice(0, MAX_DOWNLOAD_HISTORY)
        try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Ignore storage errors. */ }
        return next
      })
      const fileUrl = data.download_url || book.download_url
      if (fileUrl) triggerFileDownload(fileUrl, `${String(book.title || 'book').replace(/[^a-z0-9]/gi, '_')}.epub`)
      else showToast('No downloadable file is attached to this edition yet.', 'error')
      setReadyBook(normalizeBook({ ...book, download_url: fileUrl }))
      showToast(`“${book.title}” is ready to read!`)
    } catch (error) { showToast(error.message, 'error') }
  }

  // NEW: Reader tab on the login screen (sign in or create an account)
  const handleReaderAuth = async ({ mode, fullName, email, password }) => {
    if (!supabase) throw new Error('Supabase client is not configured. Check Services/supabaseClient.js.')
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() } } })
      if (error) throw error
      if (!data.session) return 'confirm'
      showToast(`Welcome to LumiShelf, ${fullName.trim() || 'Reader'}!`)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      showToast('Signed in successfully')
    }
    setAuthModalOpen(false)
    return 'ok'
  }

  // NEW: Admin tab. The server confirms the role; non-admins are signed straight back out.
  const handleAdminLogin = async (email, password) => {
    if (!supabase) throw new Error('Supabase client is not configured. Check Services/supabaseClient.js.')
    suppressAuthRef.current = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const response = await fetch(`${API_BASE_URL}/api/user/quota`, { headers: { Authorization: `Bearer ${data.session.access_token}`, 'x-device-id': deviceId } })
      const info = await readJsonResponse(response, 'Could not verify administrator access')
      if (info.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('This account does not have administrator access. Please use the Reader tab to sign in.')
      }
      setSession(data.session)
      setAuthModalOpen(false)
      showToast('Signed in as administrator')
    } finally {
      suppressAuthRef.current = false
    }
  }

  // NEW: saves the display name on the account (follows the user to Android)
  const handleSaveDisplayName = async (name) => {
    if (!supabase || !session) return false
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } })
    if (error) { showToast(error.message, 'error'); return false }
    if (data?.user) setSession((previous) => (previous ? { ...previous, user: data.user } : previous))
    showToast('Display name updated')
    return true
  }

  const enterGuest = () => {
    try { localStorage.setItem('lumishelf_guest', '1') } catch { /* Ignore storage errors. */ }
    setGuestMode(true)
    setAuthModalOpen(false)
  }

  const handleSignOut = async () => {
    setProfileMenuOpen(false)
    if (supabase && session) { const { error } = await supabase.auth.signOut(); if (error) showToast(error.message, 'error') }
    try { localStorage.removeItem('lumishelf_guest') } catch { /* Ignore storage errors. */ }
    setGuestMode(false); setSession(null); setUserRole('guest'); setActivePage('home'); setFavoriteIds([]); setReadyBook(null) // CHANGED: back to the login screen
  }

  const categories = useMemo(() => ['All', ...new Set(safeBooks.map((book) => book.category).filter(Boolean))], [safeBooks])
  const filteredAndSortedBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const list = safeBooks.filter((book) => {
      const categoryMatch = selectedCategory === 'All' || (book.category || '').toLowerCase() === selectedCategory.toLowerCase()
      const searchMatch = !query || [book.title, book.author, book.category].some((value) => (value || '').toLowerCase().includes(query))
      return categoryMatch && searchMatch
    })
    return [...list].sort((a, b) => sortBy === 'title' ? (a.title || '').localeCompare(b.title || '') : sortBy === 'author' ? (a.author || '').localeCompare(b.author || '') : Number(b.popularity || 0) - Number(a.popularity || 0))
  }, [safeBooks, searchQuery, selectedCategory, sortBy])
  const trendingBooks = useMemo(() => [...safeBooks].sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0)).slice(0, 6), [safeBooks])
  const libraryBooks = useMemo(() => safeBooks.filter((book) => favoriteIds.includes(book.id)), [safeBooks, favoriteIds])
  const downloadedBooks = useMemo(() => downloadedBookIds.map((id) => safeBooks.find((book) => book.id === id)).filter(Boolean), [safeBooks, downloadedBookIds])
  const userEmail = session?.user?.email || 'Guest Reader'
  const quotaDisplay = userRole === 'admin' ? `${quota.used}/∞` : `${quota.used}/${quota.limit ?? '∞'}`
  const quotaPercent = userRole === 'admin' || quota.limit == null ? 100 : Math.min(100, Math.round(quota.used / Math.max(1, quota.limit) * 100))
  const navItems = [
    { id: 'home', label: 'Home', Icon: Home, badge: null },
    { id: 'books', label: 'Books', Icon: BookOpen, badge: safeBooks.length || null },
    { id: 'library', label: 'My Library', Icon: Heart, badge: favoriteIds.length },
    { id: 'downloads', label: 'Downloads', Icon: Download, badge: quotaDisplay },
    ...(userRole === 'admin' ? [{ id: 'admin', label: 'Admin Panel', Icon: Shield, badge: 'Admin' }] : []),
  ]
  const renderBookCard = (book) => {
    if (!book || book.id == null) return null
    const isFavorite = favoriteIds.includes(book.id)
    return (
      <article key={book.id} onClick={() => setSelectedBook(book)} className={`group flex h-full cursor-pointer flex-col rounded-2xl border p-3.5 transition-all duration-200 hover:-translate-y-1 hover:border-[#FFB703]/50 ${isDark ? 'border-white/10 bg-[#1C2242]/75 hover:bg-[#1C2242]' : 'border-slate-200 bg-white shadow-sm hover:shadow-md'}`}>
        <div className="relative"><BookCoverThumbnail book={book} size="card" /><button type="button" onClick={(event) => { event.stopPropagation(); handleToggleFavorite(book) }} aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'} className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#13172E]/85 text-[#FFB703] shadow-md backdrop-blur-sm transition-transform hover:scale-110"><Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} /></button></div>
        <div className="mt-3 flex flex-1 flex-col"><h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-bold leading-snug group-hover:text-[#FFB703]" title={book.title}>{book.title}</h3><p className={`mt-1 line-clamp-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{book.author}</p><div className="mt-3 mb-3 flex items-center justify-between text-[11px]"><span className="rounded-full bg-[#FFB703]/15 px-2.5 py-0.5 font-medium text-[#FFB703]">{book.category || 'Classic'}</span><span className="opacity-65">{Number(book.popularity || 0).toLocaleString()}</span></div><button type="button" onClick={(event) => { event.stopPropagation(); handleDownloadBook(book) }} className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#FFB703] py-2 text-xs font-bold text-[#13172E] transition-colors hover:bg-amber-400"><Download className="h-3.5 w-3.5" />Download Edition</button></div>
      </article>
    )
  }

  // NEW: login screen first, until the user signs in or continues as a guest
  if (!sessionChecked) return <div className="min-h-screen bg-[#13172E]" />
  if (!signedIn && !guestMode) {
    return <AuthScreen onReaderAuth={handleReaderAuth} onAdminLogin={handleAdminLogin} onGuest={enterGuest} />
  }

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? 'bg-[#13172E] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <LumiGlobalStyles isDark={isDark} />
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDark ? 'border-white/10 bg-[#0D1021]/90' : 'border-slate-200 bg-white/95 shadow-sm'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3"><button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu" className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isDark ? 'border-white/15 bg-white/5 text-slate-200 hover:border-[#FFB703]/50' : 'border-slate-200 bg-slate-100 text-slate-700'}`}><Menu className="h-5 w-5" /></button><button type="button" onClick={() => setActivePage('home')} className="flex items-center gap-2.5 text-left"><LumiLogo className="h-9 w-9" /><span><span className="text-lg font-extrabold tracking-tight text-[#FFB703]">LumiShelf</span><span className={`ml-2 hidden rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase sm:inline-block ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>{activePage === 'library' ? 'My Library' : activePage.charAt(0).toUpperCase() + activePage.slice(1)}</span></span></button></div>
          <div className="flex items-center gap-3"><button type="button" onClick={() => setActivePage('downloads')} className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium md:inline-flex ${isDark ? 'border-white/15 bg-white/5 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'}`}><Download className="h-3.5 w-3.5 text-[#FFB703]" />{userRole === 'admin' ? 'Admin Unlimited' : `${quotaDisplay} downloads`}</button>
            <div className="relative" ref={profileDropdownRef}><button type="button" onClick={() => setProfileMenuOpen((previous) => !previous)} aria-expanded={profileMenuOpen} className={`flex items-center gap-2.5 rounded-full border py-1 pl-1.5 pr-3 ${isDark ? 'border-white/15 bg-white/5 hover:border-[#FFB703]/50' : 'border-slate-200 bg-slate-100 hover:border-amber-500'}`}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFB703] text-xs font-extrabold text-[#13172E]">{userInitials}</span><span className="max-w-[110px] truncate text-xs font-semibold">{displayName}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} /></button>
              {profileMenuOpen && <div className={`absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl border shadow-2xl ${isDark ? 'border-white/15 bg-[#0D1021] text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}><div className="border-b border-current/10 p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFB703] text-sm font-extrabold text-[#13172E]">{userInitials}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-extrabold">{displayName}</span>{signedIn && <EditName name={displayName} onSave={handleSaveDisplayName} isDark={isDark} compact />}</div><p className="truncate text-xs opacity-75">{userEmail}</p><span className="mt-1 inline-block rounded-full bg-[#FFB703]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFB703]">{userRole} Account</span></div></div><div className="mt-3.5"><div className="mb-1 flex justify-between text-[11px]"><span className="opacity-75">Download Quota</span><span className="font-bold">{userRole === 'admin' || quota.limit == null ? 'Unlimited' : `${quota.used} of ${quota.limit} used`}</span></div><div className={`h-1.5 w-full overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full rounded-full bg-[#FFB703] transition-all" style={{ width: `${quotaPercent}%` }} /></div></div></div>
                <div className="border-b border-current/10 p-3.5"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider opacity-65">Appearance</p><div className={`grid grid-cols-2 gap-1 rounded-xl p-1 ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}><button type="button" onClick={() => handleThemeChange('dark')} className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold ${isDark ? 'bg-[#FFB703] text-[#13172E]' : 'text-slate-600'}`}><Moon className="h-3.5 w-3.5" />Dark</button><button type="button" onClick={() => handleThemeChange('light')} className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold ${!isDark ? 'bg-[#FFB703] text-[#13172E]' : 'text-slate-300'}`}><Sun className="h-3.5 w-3.5" />Light</button></div></div>
                <div className="border-b border-current/10 p-2"><button type="button" onClick={() => { setActivePage('library'); setProfileMenuOpen(false) }} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium hover:bg-[#FFB703]/10"><span className="flex items-center gap-2"><Heart className="h-3.5 w-3.5 text-[#FFB703]" />My Library</span><b>{favoriteIds.length}</b></button><button type="button" onClick={() => { setActivePage('downloads'); setProfileMenuOpen(false) }} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium hover:bg-[#FFB703]/10"><span className="flex items-center gap-2"><Download className="h-3.5 w-3.5 text-[#FFB703]" />Downloads</span><b>{quotaDisplay}</b></button></div>
                <div className="p-2">{session ? <button type="button" onClick={handleSignOut} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 py-2 text-xs font-bold text-red-400"><LogOut className="h-3.5 w-3.5" />Log out</button> : <button type="button" onClick={() => { setProfileMenuOpen(false); setAuthModalOpen(true) }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFB703] py-2 text-xs font-bold text-[#13172E]"><LogIn className="h-3.5 w-3.5" />Sign In / Create Account</button>}</div>
              </div>}
            </div>
          </div>
        </div>
      </header>

      {drawerOpen && <div className="fixed inset-0 z-50 flex bg-black/65 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}><aside onClick={(event) => event.stopPropagation()} className={`flex h-full w-72 flex-col border-r shadow-2xl ${isDark ? 'border-white/10 bg-[#0D1021] text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`} aria-label="Main navigation"><div className="flex h-16 items-center justify-between border-b border-current/10 px-5"><span className="flex items-center gap-2.5"><LumiLogo className="h-8 w-8" /><b className="text-base text-[#FFB703]">LumiShelf</b></span><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu" className="rounded-lg p-1.5 opacity-75 hover:opacity-100"><X className="h-5 w-5" /></button></div><nav className="flex-1 space-y-1.5 p-3">{navItems.map(({ id, label, Icon, badge }) => <button key={id} type="button" onClick={() => { setActivePage(id); setDrawerOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold ${activePage === id ? 'border-l-4 border-[#FFB703] bg-[#FFB703]/15 text-[#FFB703]' : isDark ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'text-slate-600 hover:bg-slate-100'}`}><span className="flex items-center gap-3"><Icon className="h-4 w-4" />{label}</span>{badge !== null && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${activePage === id ? 'bg-[#FFB703] text-[#13172E]' : isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>{badge}</span>}</button>)}</nav><div className="border-t border-current/10 p-4 text-xs opacity-70">LumiShelf v2.0 • Digital Library & AI</div></aside></div>}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <DownloadReadyBanner readyBook={readyBook} onOpenFile={setReadingBook} onDismiss={dismissReadyBanner} isDark={isDark} />
        {activePage === 'home' && <div className="space-y-8"><section className={`relative overflow-hidden rounded-3xl border p-6 sm:p-10 ${isDark ? 'border-white/10 bg-gradient-to-br from-[#1C2242] via-[#13172E] to-[#0D1021]' : 'border-slate-200 bg-gradient-to-br from-amber-50 via-white to-slate-100 shadow-sm'}`}><div className="max-w-2xl space-y-4"><span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFB703]/30 bg-[#FFB703]/15 px-3 py-1 text-xs font-bold text-[#FFB703]"><Sparkles className="h-3.5 w-3.5" />Reader Dashboard</span><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome back, <span className="text-[#FFB703]">{displayName}</span></h1>{signedIn && <EditName name={displayName} onSave={handleSaveDisplayName} isDark={isDark} />}</div><p className={`text-sm leading-relaxed sm:text-base ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Discover 200+ timeless classics, resume your latest book in the reader, or ask Lumi AI to curate your next favorite.</p><div className="flex flex-wrap gap-3 pt-2"><button type="button" onClick={() => setActivePage('books')} className="inline-flex items-center gap-2 rounded-xl bg-[#FFB703] px-5 py-3 text-sm font-bold text-[#13172E] shadow-lg hover:bg-amber-400"><BookOpen className="h-4 w-4" />Explore Books</button><button type="button" onClick={() => setLumiAiOpen(true)} className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold ${isDark ? 'border-white/20 bg-white/5 text-white hover:border-[#FFB703] hover:text-[#FFB703]' : 'border-slate-300 bg-white text-slate-800 hover:border-amber-500'}`}><Bot className="h-4 w-4 text-[#FFB703]" />Ask Lumi AI</button></div></div></section>
          {continueReadingBook && <section className={`flex flex-col items-start justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:p-5 ${isDark ? 'border-[#FFB703]/30 bg-[#1C2242]/80' : 'border-amber-300 bg-amber-50/70'}`}><div className="flex items-center gap-4"><BookCoverThumbnail book={continueReadingBook} size="sm" /><div><span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FFB703]"><Clock className="h-3 w-3" />Continue Reading</span><h3 className="mt-0.5 text-base font-extrabold">{continueReadingBook.title}</h3><p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{continueReadingBook.author}</p></div></div><button type="button" onClick={() => setReadingBook(continueReadingBook)} className="inline-flex items-center gap-2 rounded-xl bg-[#FFB703] px-4 py-2.5 text-xs font-bold text-[#13172E]"><BookOpen className="h-3.5 w-3.5" />Resume Reading</button></section>}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[{ label: 'Saved in Library', value: favoriteIds.length, Icon: Heart, page: 'library', action: 'View My Library' }, { label: 'Downloads Used', value: quotaDisplay, Icon: Download, page: 'downloads', action: 'Manage Downloads' }, { label: 'Catalog Size', value: `${safeBooks.length}+`, Icon: BookMarked, page: 'books', action: 'Browse All Books' }].map((item) => <button key={item.label} type="button" onClick={() => setActivePage(item.page)} className={`rounded-2xl border p-5 text-left transition-all hover:border-[#FFB703]/50 ${isDark ? 'border-white/10 bg-[#1C2242]/75' : 'border-slate-200 bg-white shadow-sm'}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider opacity-70">{item.label}</span><item.Icon className="h-4 w-4 text-[#FFB703]" /></div><p className="mt-2 text-3xl font-extrabold">{item.value}</p><p className="mt-1 text-xs text-[#FFB703]">{item.action} →</p></button>)}</section>
          <section className="space-y-3"><h2 className="text-lg font-extrabold">Explore by Subject</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{['Science', 'Philosophy', 'Fiction', 'History'].map((category) => <button key={category} type="button" onClick={() => { setSelectedCategory(category); setActivePage('books') }} className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#FFB703] ${isDark ? 'border-white/10 bg-[#1C2242]/75' : 'border-slate-200 bg-white shadow-sm'}`}><span className="text-sm font-bold">{category}</span><ArrowRight className="h-4 w-4 text-[#FFB703]" /></button>)}</div></section>
          <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-xl font-extrabold">Top Trending Classics</h2><p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Popular editions across LumiShelf</p></div><button type="button" onClick={() => setActivePage('books')} className="inline-flex items-center gap-1 text-xs font-bold text-[#FFB703] hover:underline">View All Books<ArrowRight className="h-3.5 w-3.5" /></button></div>{loadingBooks ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl bg-current/10" />)}</div> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{trendingBooks.map(renderBookCard)}</div>}</section>
        </div>}

        {activePage === 'books' && <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-extrabold tracking-tight">Books Catalog</h1><p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Showing {filteredAndSortedBooks.length} of {safeBooks.length} books</p></div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[#FFB703]" /><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort books" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${isDark ? 'border-white/15 bg-[#1C2242] text-slate-100' : 'border-slate-300 bg-white text-slate-800'}`}><option value="popular">Sort: Most Popular</option><option value="title">Sort: Title (A–Z)</option><option value="author">Sort: Author (A–Z)</option></select></div></div><div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 focus-within:border-[#FFB703] ${isDark ? 'border-white/15 bg-[#1C2242]/75' : 'border-slate-300 bg-white shadow-sm'}`}><Search className="h-5 w-5 opacity-60" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by title, author, or subject..." className="w-full bg-transparent text-sm focus:outline-none" />{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}</div><div className="lumishelf-scroll flex items-center gap-2 overflow-x-auto pb-1">{categories.map((category) => <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold ${selectedCategory === category ? 'border-[#FFB703] bg-[#FFB703] text-[#13172E]' : isDark ? 'border-white/15 bg-white/5 text-slate-300 hover:border-[#FFB703]/40' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-500'}`}>{category}</button>)}</div>{loadingBooks ? <p className="py-8 text-center opacity-70">Loading catalog...</p> : filteredAndSortedBooks.length === 0 ? <div className={`rounded-2xl border p-12 text-center ${isDark ? 'border-white/10 bg-[#1C2242]/50' : 'border-slate-200 bg-white'}`}><p className="font-bold">No matching books found</p><p className="mt-1 text-xs opacity-70">Try clearing your search or selecting All.</p><button type="button" onClick={() => { setSearchQuery(''); setSelectedCategory('All') }} className="mt-4 rounded-xl bg-[#FFB703] px-4 py-2 text-xs font-bold text-[#13172E]">Reset Filters</button></div> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{filteredAndSortedBooks.map(renderBookCard)}</div>}</div>}

        {activePage === 'library' && <div className="space-y-6"><div><h1 className="text-2xl font-extrabold tracking-tight">My Library</h1><p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Your saved favorites synced with Lumi AI</p></div>{!session ? <div className={`rounded-3xl border p-12 text-center ${isDark ? 'border-white/10 bg-[#1C2242]/50' : 'border-slate-200 bg-white'}`}><Heart className="mx-auto h-10 w-10 text-[#FFB703]" /><h3 className="mt-3 text-lg font-extrabold">Sign in to use My Library</h3><p className="mt-1 text-xs opacity-70">Create a free Reader account to sync saved books.</p><button type="button" onClick={() => setAuthModalOpen(true)} className="mt-5 rounded-xl bg-[#FFB703] px-5 py-2.5 text-xs font-bold text-[#13172E]">Sign In / Create Account</button></div> : libraryBooks.length === 0 ? <div className={`rounded-3xl border p-12 text-center ${isDark ? 'border-white/10 bg-[#1C2242]/50' : 'border-slate-200 bg-white'}`}><Heart className="mx-auto h-10 w-10 text-[#FFB703]" /><h3 className="mt-3 text-lg font-extrabold">Your library is empty</h3><p className="mx-auto mt-1 max-w-md text-xs opacity-70">Tap the heart on any book—or ask Lumi AI to save a title.</p><button type="button" onClick={() => setActivePage('books')} className="mt-5 rounded-xl bg-[#FFB703] px-5 py-2.5 text-xs font-bold text-[#13172E]">Browse Books to Save</button></div> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{libraryBooks.map(renderBookCard)}</div>}</div>}

        {activePage === 'downloads' && <div className="space-y-6"><div><h1 className="text-2xl font-extrabold tracking-tight">Downloads & Quota Tracker</h1><p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Previously downloaded books can be reopened without using another download.</p></div><div className={`rounded-2xl border p-6 ${isDark ? 'border-white/10 bg-[#1C2242]/80' : 'border-slate-200 bg-white shadow-sm'}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-xs font-bold uppercase tracking-wider text-[#FFB703]">{userRole} Download Allowance</span><h2 className="mt-1 text-2xl font-extrabold">{userRole === 'admin' || quota.limit == null ? `${quota.used} Downloads (Unlimited)` : `${quota.used} of ${quota.limit} Downloads Used`}</h2></div>{!session && <button type="button" onClick={() => setAuthModalOpen(true)} className="rounded-xl bg-[#FFB703] px-4 py-2 text-xs font-bold text-[#13172E]">Sign In to Unlock 10 Downloads</button>}</div><div className={`mt-4 h-2.5 w-full overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full rounded-full bg-[#FFB703] transition-all" style={{ width: `${quotaPercent}%` }} /></div></div>{downloadedBooks.length === 0 ? <div className={`rounded-3xl border p-12 text-center ${isDark ? 'border-white/10 bg-[#1C2242]/50' : 'border-slate-200 bg-white'}`}><Download className="mx-auto h-10 w-10 text-[#FFB703]" /><h3 className="mt-3 text-lg font-extrabold">No downloaded books yet</h3><p className="mt-1 text-xs opacity-70">Downloaded editions appear here for quick in-app reading.</p><button type="button" onClick={() => setActivePage('books')} className="mt-5 rounded-xl bg-[#FFB703] px-5 py-2.5 text-xs font-bold text-[#13172E]">Explore Books</button></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{downloadedBooks.map((book) => <div key={book.id} className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-[#1C2242]/75' : 'border-slate-200 bg-white shadow-sm'}`}><div className="flex min-w-0 items-center gap-3.5"><BookCoverThumbnail book={book} size="sm" /><div className="min-w-0"><h3 className="line-clamp-1 text-sm font-bold">{book.title}</h3><p className="line-clamp-1 text-xs opacity-65">{book.author}</p></div></div><button type="button" onClick={() => setReadingBook(book)} className="shrink-0 rounded-xl bg-[#FFB703] px-3.5 py-2 text-xs font-bold text-[#13172E]">Read in App</button></div>)}</div>}</div>}

        {activePage === 'admin' && userRole === 'admin' && <AdminPanelView books={safeBooks} session={session} apiBaseUrl={API_BASE_URL} onBooksChanged={fetchBooks} showToast={showToast} isDark={isDark} />}
      </main>

      <BookDetailModal book={selectedBook} isFavorite={selectedBook ? favoriteIds.includes(selectedBook.id) : false} onToggleFavorite={handleToggleFavorite} onReadBook={setReadingBook} onDownloadBook={handleDownloadBook} onClose={() => setSelectedBook(null)} isDark={isDark} />
      <InAppReaderModal book={readingBook} apiBaseUrl={API_BASE_URL} onClose={() => setReadingBook(null)} onDownload={handleDownloadBook} isDark={isDark} />
      <LumiAiWidget isOpen={lumiAiOpen} setIsOpen={setLumiAiOpen} session={session} apiBaseUrl={API_BASE_URL} onLibraryUpdated={fetchFavorites} onOpenAuth={() => setAuthModalOpen(true)} isDark={isDark} />

      {/* CHANGED: the sign-in modal is now the same split-card screen, shown over the app for guests */}
      {authModalOpen && !signedIn && (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-[#0A0D1A]">
          <AuthScreen onReaderAuth={handleReaderAuth} onAdminLogin={handleAdminLogin} onGuest={enterGuest} onClose={() => setAuthModalOpen(false)} />
        </div>
      )}

      {toasts.length > 0 && <div className="fixed bottom-6 left-6 z-[100] flex max-w-[min(90vw,28rem)] flex-col gap-2">{toasts.map((toast) => <div key={toast.id} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-xl backdrop-blur-md ${toast.type === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-200' : isDark ? 'border-[#FFB703]/40 bg-[#0D1021]/95 text-slate-100' : 'border-slate-300 bg-white/95 text-slate-900'}`}><span className={`h-2 w-2 rounded-full ${toast.type === 'error' ? 'bg-red-400' : 'bg-[#FFB703]'}`} />{toast.message}</div>)}</div>}
    </div>
  )
}

// ============================================================================
// ROOT APP EXPORT — WRAPS THE APPLICATION WITH THE ERROR BOUNDARY
// ============================================================================
export function App() {
  return (
    <LumiErrorBoundary>
      <LumiShelfApp />
    </LumiErrorBoundary>
  )
}

export default App