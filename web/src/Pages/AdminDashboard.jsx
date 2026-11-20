import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Library, Download, Users, Smartphone, Plus, Pencil, Trash2,
  Search, X, RefreshCw,
} from 'lucide-react'
import { getAnalytics, getAdminBooks, saveBook, removeBook } from '../api'
import BookCoverThumbnail from '../Components/BookCoverThumbnail'

const GOAL = 200
const inputCls =
  'w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-slate-100 outline-none focus:ring-2 focus:ring-[#FFB703] disabled:opacity-50'

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="lumishelf-scroll max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#13172E] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full bg-white/10 p-2 text-slate-200 hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#13172E] p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">{label}</span>
        <span className="rounded-lg bg-[#FFB703]/15 p-2 text-[#FFB703]">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold text-white">{value}</p>
      <div className="mt-2 text-sm text-slate-400">{children}</div>
    </div>
  )
}

function BookForm({ book, categories = [], onCancel, onSaved }) {
  const editing = Boolean(book)
  const [f, setF] = useState({
    title: book?.title ?? '',
    author: book?.author ?? '',
    category: book?.category_id ?? '',
    cover_url: book?.cover_url ?? '',
    epub_url: book?.download_url ?? '',
    gutenberg_id: book?.gutenberg_id ?? '',
    popularity: book?.popularity ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (event) =>
    setF((state) => ({ ...state, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setError('')

    if (!f.title.trim() || !f.author.trim()) {
      setError('Title and author are required.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: f.title.trim(),
        author: f.author.trim(),
        category: f.category || null,
        cover_url: f.cover_url.trim(),
        epub_url: f.epub_url.trim(),
        popularity: Number(f.popularity) || 0,
      }

      if (!editing && f.gutenberg_id) {
        payload.gutenberg_id = Number(f.gutenberg_id)
      }

      await saveBook(payload, book?.id)
      await onSaved()
    } catch (err) {
      setError(err.message || 'Could not save this book.')
    } finally {
      setSaving(false)
    }
  }

  const previewBook = {
    title: f.title || 'New LumiShelf Book',
    cover_url: f.cover_url,
    gutenberg_id: f.gutenberg_id,
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-200">
          Title *
        </label>
        <input className={inputCls} value={f.title} onChange={set('title')} required />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-200">
          Author *
        </label>
        <input className={inputCls} value={f.author} onChange={set('author')} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-200">
            Category
          </label>
          <select className={inputCls} value={f.category} onChange={set('category')}>
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-200">
            Popularity
          </label>
          <input
            type="number"
            min="0"
            className={inputCls}
            value={f.popularity}
            onChange={set('popularity')}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-200">
          Gutenberg ID
        </label>
        <input
          type="number"
          min="1"
          className={inputCls}
          value={f.gutenberg_id}
          onChange={set('gutenberg_id')}
          disabled={editing}
          placeholder="e.g. 1342"
        />
        <p className="mt-1 text-xs text-slate-500">
          Enter a Gutenberg ID and leave the two links blank to fill them in automatically.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-200">
          Cover image URL
        </label>
        <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-slate-950/50 p-3">
          <BookCoverThumbnail book={previewBook} size="md" />
          <div className="min-w-0 flex-1">
            <input
              className={inputCls}
              value={f.cover_url}
              onChange={set('cover_url')}
              placeholder="https://…"
            />
            <p className="mt-1 text-xs text-slate-500">
              Live preview. If this URL fails, the Gutenberg cover mirror or a branded placeholder is shown.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-200">
          EPUB download URL
        </label>
        <input
          className={inputCls}
          value={f.epub_url}
          onChange={set('epub_url')}
          placeholder="https://…"
        />
      </div>

      <p className="text-xs text-slate-500">
        Only add books that are public domain or openly licensed.
      </p>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold text-slate-200 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          disabled={saving}
          className="rounded-xl bg-[#FFB703] px-5 py-2.5 font-bold text-[#13172E] hover:brightness-110 disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Book'}
        </button>
      </div>
    </form>
  )
}

export default function AdminDashboard({ categories = [], onChanged }) {
  const [stats, setStats] = useState(null)
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(25)
  const [form, setForm] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [analytics, adminBooks] = await Promise.all([
        getAnalytics(),
        getAdminBooks(),
      ])
      setStats(analytics)
      setBooks(adminBooks || [])
    } catch (err) {
      setError(err.message || 'Could not load administrator data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function flash(message) {
    setToast(message)
    setTimeout(() => setToast(''), 4000)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return books

    return books.filter((book) =>
      [book.title, book.author, book.categories?.name].some((value) =>
        (value || '').toLowerCase().includes(q)
      )
    )
  }, [books, query])

  async function handleSaved() {
    setForm(null)
    flash('Book saved.')
    await load()
    onChanged?.()
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await removeBook(deleting.id)
      flash(`Deleted “${deleting.title}”.`)
      setDeleting(null)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Could not delete this book.')
      setDeleting(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  const byCategory = stats?.byCategory || []
  const topBooks = stats?.topBooks || []
  const maxCat = Math.max(1, ...byCategory.map((category) => Number(category.books) || 0))
  const totalBooks = Number(stats?.totalBooks) || 0
  const met = totalBooks >= GOAL

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Admin Dashboard</h2>
          <p className="text-sm text-slate-400">System metrics and catalog management</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-[#FFB703]/50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {toast && (
        <p className="mt-4 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-medium text-emerald-300">
          {toast}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-red-950 px-4 py-3 text-sm font-medium text-red-300">
          {error}
        </p>
      )}
      {loading && !stats && (
        <p className="mt-8 text-slate-400">Loading dashboard…</p>
      )}

      {stats && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Library} label="Total Catalog Books" value={totalBooks.toLocaleString()}>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${met ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#FFB703]/15 text-[#FFB703]'}`}>
                {met ? '✓ 200+ requirement met' : `${totalBooks}/${GOAL} toward 200+`}
              </span>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#FFB703]"
                  style={{ width: `${Math.min(100, (totalBooks / GOAL) * 100)}%` }}
                />
              </div>
            </Kpi>

            <Kpi icon={Download} label="Total Downloads" value={(Number(stats.totalDownloads) || 0).toLocaleString()}>
              Registered <b className="text-slate-200">{stats.registeredDownloads ?? 0}</b> · Guest <b className="text-slate-200">{stats.guestDownloads ?? 0}</b>
            </Kpi>

            <Kpi icon={Users} label="Registered Readers" value={(Number(stats.registeredUsers) || 0).toLocaleString()}>
              Total accounts
            </Kpi>

            <Kpi icon={Smartphone} label="Active Guest Sessions" value={(Number(stats.guestDevices) || 0).toLocaleString()}>
              Unique guest devices that downloaded
            </Kpi>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#13172E] p-5">
              <h3 className="font-bold text-white">Books by Category</h3>
              <div className="mt-4 space-y-3">
                {byCategory.map((category) => (
                  <div key={category.name}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">{category.name}</span>
                      <span className="font-semibold text-slate-200">{category.books}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#FFB703]"
                        style={{ width: `${((Number(category.books) || 0) / maxCat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {byCategory.length === 0 && (
                  <p className="text-sm text-slate-500">No category statistics available.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#13172E] p-5">
              <h3 className="font-bold text-white">Top Downloaded Classics</h3>
              {stats.topBooksBasis === 'popularity' && (
                <p className="mt-1 text-xs text-slate-500">
                  No downloads yet, so these are ranked by popularity score.
                </p>
              )}
              <ol className="mt-4 space-y-3">
                {topBooks.map((book, index) => (
                  <li key={book.id} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFB703]/15 text-sm font-bold text-[#FFB703]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-100">{book.title}</p>
                      <p className="truncate text-xs text-slate-400">{book.author}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#FFB703]">
                      {book.downloads ?? 0}{' '}
                      <span className="text-xs font-normal text-slate-500">downloads</span>
                    </span>
                  </li>
                ))}
                {topBooks.length === 0 && (
                  <li className="text-sm text-slate-500">Nothing to show yet.</li>
                )}
              </ol>
            </div>
          </div>
        </>
      )}

      {/* Book management */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-[#13172E] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Book Management</h3>
          <button
            type="button"
            onClick={() => setForm({ book: null })}
            className="flex items-center gap-2 rounded-xl bg-[#FFB703] px-4 py-2 font-bold text-[#13172E] hover:brightness-110"
          >
            <Plus size={18} /> Add New Book
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShown(25)
            }}
            placeholder="Filter by title, author, or category…"
            className="w-full rounded-xl border border-white/10 bg-slate-950 py-2.5 pl-11 pr-4 text-slate-100 outline-none focus:ring-2 focus:ring-[#FFB703]"
          />
        </div>

        <div className="lumishelf-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pr-3">Cover</th>
                <th className="py-3 pr-3">Title &amp; Author</th>
                <th className="py-3 pr-3">Category</th>
                <th className="py-3 pr-3">Popularity</th>
                <th className="py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((book) => (
                <tr key={book.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.025]">
                  <td className="py-3 pr-3">
                    <BookCoverThumbnail book={book} size="sm" />
                  </td>
                  <td className="max-w-[260px] py-3 pr-3">
                    <p
                      className="line-clamp-1 font-semibold text-slate-100"
                      title={book.title}
                    >
                      {book.title}
                    </p>
                    <p className="line-clamp-1 text-xs text-slate-400" title={book.author}>
                      {book.author}
                    </p>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                      {book.categories?.name ?? 'Uncategorized'}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">{book.popularity ?? 0}</td>
                  <td className="py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ book })}
                        className="flex items-center gap-1 rounded-lg border border-[#FFB703]/40 px-3 py-1.5 text-xs font-semibold text-[#FFB703] hover:bg-[#FFB703]/10"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(book)}
                        className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && (
            <p className="py-8 text-center text-slate-500">No books match your filter.</p>
          )}
        </div>

        {filtered.length > shown && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShown((number) => number + 25)}
              className="rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
            >
              Show more ({filtered.length - shown} remaining)
            </button>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Showing {Math.min(shown, filtered.length)} of {filtered.length} books
        </p>
      </div>

      {form && (
        <Modal
          title={form.book ? 'Edit Book' : 'Add New Book'}
          onClose={() => setForm(null)}
        >
          <BookForm
            book={form.book}
            categories={categories}
            onCancel={() => setForm(null)}
            onSaved={handleSaved}
          />
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete book?"
          onClose={() => !deleteBusy && setDeleting(null)}
        >
          <p className="mt-4 text-slate-300">
            Are you sure you want to delete <b className="text-white">{deleting.title}</b>?
          </p>
          <p className="mt-2 text-sm text-slate-500">
            This also removes its download history and any reader’s saved favorite of it. It can’t be undone.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
              className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold text-slate-200 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteBusy}
              className="rounded-xl bg-red-500/90 px-5 py-2.5 font-bold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
