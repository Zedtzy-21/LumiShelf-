import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'

/**
 * Shared thumbnail used by the main reader, BookDetailModal, and AdminDashboard.
 * Tries the database cover URL, then a Project Gutenberg cover mirror, then a
 * branded placeholder so broken/missing images never leave an empty cell.
 */
export default function BookCoverThumbnail({ book, size = 'sm' }) {
  const [fallbackStep, setFallbackStep] = useState(0)

  useEffect(() => {
    setFallbackStep(0)
  }, [book?.cover_url, book?.gutenberg_id, book?.title])

  const sizeClasses = {
    sm: 'h-16 w-11 rounded-md',
    md: 'h-24 w-16 rounded-lg',
    lg: 'h-36 w-24 rounded-xl',
  }[size] || 'h-16 w-11 rounded-md'

  const mirrorCoverUrl = book?.gutenberg_id
    ? `https://gutenberg.pglaf.org/cache/epub/${book.gutenberg_id}/pg${book.gutenberg_id}.cover.medium.jpg`
    : null

  const activeSrc =
    fallbackStep === 0 && book?.cover_url
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
        <img
          src={activeSrc}
          alt={book?.title || 'Book cover'}
          loading="lazy"
          onError={() => setFallbackStep((previous) => previous + 1)}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={`${sizeClasses} relative flex shrink-0 flex-col items-center justify-center overflow-hidden border border-[#FFB703]/30 border-l-[3px] border-l-[#FFB703] bg-gradient-to-br from-[#1C2242] via-[#13172E] to-[#0A0D1A] px-1 text-center shadow-sm`}
      title={book?.title || 'LumiShelf Edition'}
      aria-label={`No cover image available for ${book?.title || 'this book'}`}
    >
      <BookOpen className="mb-0.5 h-3.5 w-3.5 text-[#FFB703]/90" />
      <span className="text-[10px] font-extrabold tracking-wider text-slate-200">
        {initials}
      </span>
    </div>
  )
}
