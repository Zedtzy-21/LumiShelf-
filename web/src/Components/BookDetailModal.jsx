import { useEffect, useRef, useState } from 'react'
import {
  X, Heart, Download, BookOpen, ArrowLeft, ExternalLink,
} from 'lucide-react'
import { getPreview } from '../api'

const OL = 'https://openlibrary.org'
const cleanTitle = (title) => title.split(';')[0].split(':')[0].replace(/\s+/g, ' ').trim()
const tidy = (text) =>
  text.split(/-{5,}/)[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 1200)

// Description lookup on Open Library; returns null if anything fails.
async function lookup(book, signal) {
  const lastName = (book.author || '').split(' ').pop().toLowerCase()
  const url = `${OL}/search.json?title=${encodeURIComponent(cleanTitle(book.title || ''))}&limit=10&fields=key,title,author_name,first_publish_year`
  const response = await fetch(url, { signal })
  if (!response.ok) return null

  const { docs = [] } = await response.json()
  const hit = docs.find((doc) =>
    (doc.author_name || []).some((author) => author.toLowerCase().includes(lastName))
  )
  if (!hit) return null

  let about = null
  const workResponse = await fetch(`${OL}${hit.key}.json`, { signal })
  if (workResponse.ok) {
    const description = (await workResponse.json()).description
    const raw = typeof description === 'string' ? description : description?.value
    about = raw ? tidy(raw) : null
  }

  return { year: hit.first_publish_year || null, about }
}

function Fade({ children }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div className={`transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-0'}`}>
      {children}
    </div>
  )
}

const isHeading = (paragraph) =>
  paragraph.length < 80 &&
  (/^(chapter|book|part|letter|stave|canto)\b/i.test(paragraph) ||
    (paragraph === paragraph.toUpperCase() && /[A-Z]/.test(paragraph)))

export default function BookDetailModal({
  book,
  saved,
  notice,
  onClose,
  onDownload,
  onToggleFavorite,
  onOpenReader,
}) {
  const [mode, setMode] = useState('details')
  const [extra, setExtra] = useState({ loading: true, about: null, year: null })
  const [expanded, setExpanded] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)
  const [preview, setPreview] = useState({ status: 'idle', data: null })
  const [fontSize, setFontSize] = useState(() => {
    try {
      return Number(localStorage.getItem('lumishelf_reader_size')) || 18
    } catch {
      return 18
    }
  })
  const box = useRef(null)

  // Escape closes the modal and the page behind it stops scrolling.
  useEffect(() => {
    const handleKey = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  // Description from Open Library.
  useEffect(() => {
    const controller = new AbortController()
    setExtra({ loading: true, about: null, year: null })
    lookup(book, controller.signal)
      .then((result) => setExtra({
        loading: false,
        about: result?.about ?? null,
        year: result?.year ?? null,
      }))
      .catch(() => setExtra({ loading: false, about: null, year: null }))

    return () => controller.abort()
  }, [book.id, book.title, book.author])

  // Load the free Chapter 1 glimpse. It does not consume download quota.
  async function loadPreview() {
    setPreview({ status: 'loading', data: null })
    let next = { status: 'error', data: null }
    let timer

    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Preview request timed out')), 25000)
      })
      const data = await Promise.race([getPreview(book.id), timeout])
      if (data?.previewText?.trim()) {
        next = { status: 'ready', data }
      }
    } catch {
      // Show the retry/download fallback card.
    } finally {
      clearTimeout(timer)
      setPreview(next)
    }
  }

  useEffect(() => {
    if (mode !== 'reader' || preview.status !== 'idle') return
    loadPreview()
    // loadPreview is intentionally tied to the selected book and reader mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, preview.status, book.id])

  useEffect(() => {
    box.current?.scrollTo({ top: 0 })
  }, [mode])

  function changeSize(delta) {
    setFontSize((current) => {
      const next = Math.min(28, Math.max(14, current + delta))
      try {
        localStorage.setItem('lumishelf_reader_size', String(next))
      } catch {
        // Local storage may be unavailable in private browsing.
      }
      return next
    })
  }

  const category = book.categories?.name
  const topics = (book.subjects || '')
    .split(';')
    .map((subject) => subject.trim())
    .filter(Boolean)
    .slice(0, 6)

  const about = extra.about ||
    `${book.title} by ${book.author}${category ? ` is a ${category} title` : ''} from Project Gutenberg’s free public domain collection.`
  const isLong = about.length > 350
  const pill = 'rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300'

  const noticeBox = notice && (
    <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${notice.type === 'ok' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
      {notice.text}{' '}
      {notice.url && onOpenReader && (
        <button
          type="button"
          onClick={() => onOpenReader(book)}
          className="font-bold underline"
        >
          Read in LumiShelf
        </button>
      )}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${book.title}`}
    >
      <div
        ref={box}
        onClick={(event) => event.stopPropagation()}
        className={`lumishelf-scroll relative max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-[#13172E] p-6 shadow-2xl md:p-10 ${mode === 'reader' ? 'max-w-3xl' : 'max-w-5xl'}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-slate-200 hover:bg-white/20"
        >
          <X size={20} />
        </button>

        {mode === 'details' ? (
          <Fade key="details">
            <div className="grid gap-8 md:grid-cols-[260px_1fr]">
              <div className="mx-auto w-52 md:w-full">
                <div className="aspect-[2/3] overflow-hidden rounded-2xl bg-slate-800 shadow-xl shadow-black/40 ring-1 ring-white/10">
                  {book.cover_url && !coverFailed ? (
                    <img
                      src={book.cover_url}
                      alt={`Cover of ${book.title}`}
                      className="h-full w-full object-cover"
                      onError={() => setCoverFailed(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-700 to-indigo-950 p-4 text-center font-bold text-white">
                      {book.title}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('reader')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFB703] py-3 font-bold text-[#13172E] hover:brightness-110"
                  >
                    <BookOpen size={18} /> Read Glimpse (Chapter 1)
                  </button>

                  {onOpenReader && (
                    <button
                      type="button"
                      onClick={() => onOpenReader(book)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#FFB703]/60 bg-[#FFB703]/10 py-3 font-semibold text-[#FFB703] transition-colors hover:bg-[#FFB703] hover:text-[#13172E]"
                    >
                      <BookOpen size={18} /> Open In-App Book Reader
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleFavorite(book)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3 font-semibold text-slate-100 hover:bg-white/10"
                  >
                    <Heart size={18} className="text-[#FFB703]" fill={saved ? 'currentColor' : 'none'} />
                    {saved ? 'Favorited' : 'Save to Library'}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownload(book)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#FFB703]/60 py-3 font-semibold text-[#FFB703] transition-colors hover:bg-[#FFB703] hover:text-[#13172E]"
                  >
                    <Download size={18} /> Download EPUB
                  </button>
                </div>
                {noticeBox}
              </div>

              <div>
                <h2 className="pr-10 text-3xl font-extrabold leading-tight text-white md:text-4xl">
                  {book.title}
                </h2>
                <p className="mt-2 text-slate-400">
                  {book.author}
                  {book.gutenberg_id ? ` • Gutenberg #${book.gutenberg_id}` : ''}
                  {extra.year ? ` • ${extra.year}` : ''}
                </p>
                <p className="mt-3 text-sm font-medium text-[#FFB703]">
                  {book.license || 'Public Domain'} Classic • Free on Project Gutenberg
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {category && (
                    <span className="rounded-full bg-[#FFB703]/15 px-3 py-1 text-xs font-semibold text-[#FFB703]">
                      {category}
                    </span>
                  )}
                  {topics.map((topic) => (
                    <span key={topic} className={pill}>{topic}</span>
                  ))}
                </div>

                <h3 className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-400">
                  About this book
                </h3>
                <p className={`mt-2 whitespace-pre-line leading-relaxed text-slate-200 ${isLong && !expanded ? 'line-clamp-5' : ''}`}>
                  {extra.loading ? 'Loading description…' : about}
                </p>
                {isLong && !extra.loading && (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-1 text-sm font-semibold text-[#FFB703] hover:underline"
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
                {extra.about && !extra.loading && (
                  <p className="mt-1 text-xs text-slate-500">Description from Open Library</p>
                )}

                <dl className="mt-7 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-slate-500">Source</dt><dd className="text-slate-200">{book.source_name || 'Project Gutenberg'}</dd></div>
                  <div><dt className="text-slate-500">License</dt><dd className="text-slate-200">{book.license || 'Public Domain'}</dd></div>
                  <div><dt className="text-slate-500">Language</dt><dd className="text-slate-200">{(book.language || 'en').toUpperCase()}</dd></div>
                  <div><dt className="text-slate-500">Format</dt><dd className="text-slate-200">EPUB</dd></div>
                </dl>

                {book.source_url && (
                  <a
                    href={book.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"
                  >
                    <ExternalLink size={16} /> Project Gutenberg page
                  </a>
                )}
              </div>
            </div>
          </Fade>
        ) : (
          <Fade key="reader">
            <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
              <button
                type="button"
                onClick={() => setMode('details')}
                className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white"
              >
                <ArrowLeft size={18} /> Back to Book Details
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changeSize(-2)}
                  aria-label="Smaller text"
                  className="rounded-lg border border-white/15 px-3 py-1 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >A−</button>
                <span className="w-12 text-center text-xs text-slate-400">{fontSize}px</span>
                <button
                  type="button"
                  onClick={() => changeSize(2)}
                  aria-label="Larger text"
                  className="rounded-lg border border-white/15 px-3 py-1 text-base font-semibold text-slate-200 hover:bg-white/10"
                >A+</button>
              </div>
            </div>

            <div className="mt-4 text-center">
              <span className="inline-block rounded-full bg-[#FFB703]/15 px-4 py-1 text-xs font-semibold text-[#FFB703]">
                Free Chapter 1 Glimpse • Does not use download quota
              </span>
            </div>

            <article
              className="mx-auto mt-6 max-w-2xl rounded-2xl bg-[#0F1225] px-6 py-8 text-slate-200 md:px-10"
              style={{ fontFamily: 'Georgia, serif', fontSize }}
            >
              <h2 className="text-center font-bold text-white" style={{ fontSize: fontSize * 1.4 }}>
                {book.title}
              </h2>
              <p className="mt-1 text-center italic text-slate-400" style={{ fontSize: fontSize * 0.85 }}>
                {book.author}
              </p>
              <hr className="my-6 border-white/10" />

              {preview.status === 'loading' || preview.status === 'idle' ? (
                <div className="animate-pulse space-y-4" aria-label="Loading preview">
                  {[100, 95, 98, 60, 100, 92, 97, 70, 100, 90, 55].map((width, index) => (
                    <div key={index} className="h-4 rounded bg-white/10" style={{ width: `${width}%` }} />
                  ))}
                </div>
              ) : preview.status === 'error' ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                  <p className="text-slate-200">Preview text is temporarily unavailable for this title.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3" style={{ fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
                    <button
                      type="button"
                      onClick={loadPreview}
                      className="rounded-xl border border-white/15 px-4 py-2 font-semibold text-slate-100 hover:bg-white/10"
                    >Retry Preview</button>
                    <button
                      type="button"
                      onClick={() => onDownload(book)}
                      className="flex items-center gap-2 rounded-xl bg-[#FFB703] px-4 py-2 font-bold text-[#13172E] hover:brightness-110"
                    ><Download size={16} /> Download Full EPUB</button>
                    {book.source_url && (
                      <a
                        href={book.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-white/15 px-4 py-2 font-semibold text-slate-100 hover:bg-white/10"
                      >Read on Project Gutenberg</a>
                    )}
                  </div>
                  <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
                    {noticeBox}
                  </div>
                </div>
              ) : (
                <>
                  {preview.data.previewText.split('\n\n').map((paragraph, index) =>
                    isHeading(paragraph) ? (
                      <h3
                        key={index}
                        className="mt-8 text-center font-bold tracking-wide text-white"
                        style={{ fontSize: fontSize * 1.15 }}
                      >{paragraph}</h3>
                    ) : (
                      <p key={index} className="mt-5 leading-relaxed">{paragraph}</p>
                    )
                  )}
                  <p className="mt-6 text-right text-xs text-slate-500" style={{ fontFamily: 'system-ui, sans-serif' }}>
                    About {(preview.data.wordCountEstimate ?? 0).toLocaleString()} words
                  </p>
                </>
              )}
            </article>

            {preview.status === 'ready' && (
              <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-[#FFB703]/40 bg-[#FFB703]/10 p-6 text-center">
                <h3 className="text-xl font-bold text-white">End of Free Glimpse — Want to keep reading?</h3>
                <p className="mt-2 text-sm text-slate-300">
                  Download the full book to read it in your favorite e-reader. This uses one of your downloads.
                </p>
                <button
                  type="button"
                  onClick={() => onDownload(book)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FFB703] px-6 py-3 font-bold text-[#13172E] hover:brightness-110"
                >
                  <Download size={18} /> Download Full EPUB
                </button>
                {noticeBox}
              </div>
            )}
          </Fade>
        )}
      </div>
    </div>
  )
}
