import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Disable Express fingerprinting and apply baseline HTTP security headers.
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

/**
 * Lightweight in-memory fixed-window rate limiter.
 * Uses Express's resolved client IP (req.ip), not an untrusted raw
 * X-Forwarded-For header. If deployed behind a trusted reverse proxy,
 * configure app.set('trust proxy', <trusted hop count>) explicitly.
 */
function createRateLimiter({ windowMs, maxRequests, keyPrefix, message }) {
  const hits = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now >= entry.resetAt) hits.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanupTimer.unref?.();

  return (req, res, next) => {
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const bucketKey = `${keyPrefix}:${clientIp}`;
    const now = Date.now();

    let record = hits.get(bucketKey);
    if (!record || now >= record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
    }

    record.count += 1;
    hits.set(bucketKey, record);

    const remaining = Math.max(0, maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (record.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: message || 'Too many requests. Please slow down and try again shortly.',
        retryAfterSeconds: retryAfterSec
      });
    }

    return next();
  };
}

const aiChatRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 25,
  keyPrefix: 'ai_chat',
  message: 'Lumi AI rate limit reached (25 requests/min). Please wait a moment before asking again.'
});

const downloadRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  keyPrefix: 'book_download',
  message: 'Download rate limit reached (15 requests/min). Please wait a moment and try again.'
});

console.log("Loaded URL:", process.env.SUPABASE_URL);
console.log("Loaded Key:", process.env.SUPABASE_ANON_KEY ? "EXISTS" : "MISSING");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Download limits
const LIMITS = { guest: 5, user: 10 };

// Verify Supabase access token and populate req.user
app.use(async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    req.user = null;
    return next();
  }

  try {
    const { data, error } = await supabase.auth.getUser(match[1]);

    if (error || !data?.user) {
      return res.status(401).json({
        error: 'Invalid or expired access token'
      });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Could not verify access token'
    });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'LumiShelf API' });
});

// Fetch Categories from Supabase
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*');

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Books from Supabase
app.get('/api/books', async (req, res) => {
  const { category, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 24, 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  let query = supabase
    .from('books')
    .select('*, categories(name, slug)')
    .order('popularity', { ascending: false })
    .order('title')
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq('category_id', category);
  }

  if (q) {
    const safe = String(q).replace(/[,()]/g, ' ');
    query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Total number of books
app.get('/api/stats', async (req, res) => {
  const { count } = await supabase
    .from('books')
    .select('*', { count: 'exact', head: true });

  res.json({ books: count });
});

// Only logged-in users can use favorites
function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please log in' });
  }

  next();
}

app.get('/api/favorites', requireUser, async (req, res) => {
  const { data, error } = await supabase
    .from('favorites')
    .select('created_at, books(*, categories(name, slug))')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data.map((f) => f.books));
});

app.post('/api/favorites/:bookId', requireUser, async (req, res) => {
  const { error } = await supabase
    .from('favorites')
    .upsert(
      {
        user_id: req.user.id,
        book_id: req.params.bookId
      },
      { onConflict: 'user_id,book_id' }
    );

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ saved: true });
});

app.delete('/api/favorites/:bookId', requireUser, async (req, res) => {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', req.user.id)
    .eq('book_id', req.params.bookId);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ saved: false });
});


// ---------- Book preview: free Chapter 1 glimpse ----------
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/plain,text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TEXT_SCAN_CHARS = 30000;
const HTML_SCAN_CHARS = 150000;

// Streams a file and stops after enough characters
async function streamHead(url, maxChars, signal) {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    signal,
    redirect: 'follow'
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let text = '';

  try {
    while (text.length < maxChars) {
      const { done, value } = await reader.read();

      if (done) break;

      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return text;
}

// HTML to clean text
function htmlToText(html) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
    mdash: '—',
    ndash: '–',
    hellip: '…'
  };

  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>|<br\s*\/?>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d) =>
      String.fromCodePoint(Number(d))
    )
    .replace(/&([a-z]+);/gi, (m, n) =>
      named[n.toLowerCase()] ?? m
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

// Tries each Gutenberg source
async function fetchBookText(gid) {
  const sources = [
    {
      url: `https://gutenberg.pglaf.org/cache/epub/${gid}/pg${gid}.txt`,
      html: false
    },
    {
      url: `https://www.gutenberg.org/files/${gid}/${gid}-0.txt`,
      html: false
    },
    {
      url: `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`,
      html: false
    },
    {
      url: `https://gutenberg.pglaf.org/cache/epub/${gid}/pg${gid}.html`,
      html: true
    },
    {
      url: `https://gutenberg.pglaf.org/cache/epub/${gid}/pg${gid}-images.html`,
      html: true
    }
  ];

  const deadline = AbortSignal.timeout(22000);
  let lastErr = new Error('No source worked');

  for (const s of sources) {
    if (deadline.aborted) break;

    try {
      const signal = AbortSignal.any([
        deadline,
        AbortSignal.timeout(8000)
      ]);

      const raw = await streamHead(
        s.url,
        s.html ? HTML_SCAN_CHARS : TEXT_SCAN_CHARS,
        signal
      );

      const text = s.html ? htmlToText(raw) : raw;

      if (text.length > 500) return text;

      lastErr = new Error('Empty response');
    } catch (err) {
      lastErr = err;

      console.log(
        `  preview source failed (${new URL(s.url).host}): ${err.message}`
      );
    }
  }

  throw lastErr;
}

function buildPreview(raw) {
  let text = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

  // Remove everything before START marker
  const marker = text.match(
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i
  );

  if (marker) {
    text = text.slice(marker.index + marker[0].length);
  }

  text = text.replace(/^\s+/, '');

  // Find the actual Chapter 1
  const CH1 = /^[ \t]*(?:chapter|book|part|letter|stave|canto)[ \t]+(?:1|i|one|the first)\b[^\n]*$/gim;
  const CH2 = /^[ \t]*(?:chapter|book|part|letter|stave|canto)[ \t]+(?:2|ii|two|the second)\b/im;

  let from = 0;

  for (const m of text.matchAll(CH1)) {
    const after = text.slice(
      m.index + m[0].length,
      m.index + m[0].length + 1200
    );

    if (!CH2.test(after)) {
      from = m.index;
      break;
    }
  }

  text = text.slice(from).trim();

  // First 4,500 characters
  let excerpt = text.slice(0, 4500);

  if (text.length > 4500) {
    const cut = excerpt.lastIndexOf('\n\n');

    if (cut > 1500) {
      excerpt = excerpt.slice(0, cut);
    }
  }

  // Unwrap hard line breaks
  return excerpt
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

app.get('/api/books/:id/preview', async (req, res) => {
  const countWords = (t) =>
    t.split(/\s+/).filter(Boolean).length;

  try {
    const { data: book, error } = await supabase
      .from('books')
      .select('id, title, author, gutenberg_id, preview_text')
      .eq('id', req.params.id)
      .single();

    if (error || !book) {
      console.error('Preview lookup error:', error?.message);

      const missingColumn = /preview_text/i.test(
        error?.message || ''
      );

      return res
        .status(missingColumn ? 500 : 404)
        .json({
          error: missingColumn
            ? 'Database is missing the preview_text column'
            : 'Book not found'
        });
    }

    // Use saved preview if available
    if (book.preview_text?.trim()) {
      const previewText = book.preview_text;

      return res.json({
        id: book.id,
        title: book.title,
        author: book.author,
        previewText,
        wordCountEstimate: countWords(previewText)
      });
    }

    if (!book.gutenberg_id) {
      return res.status(404).json({
        error: 'No preview available for this title'
      });
    }

    // Fetch Gutenberg content
    const previewText = buildPreview(
      await fetchBookText(book.gutenberg_id)
    );

    if (previewText.length < 200) {
      throw new Error('Preview text too short');
    }

    // Save preview in database
    const { error: saveErr } = await supabase
      .from('books')
      .update({ preview_text: previewText })
      .eq('id', book.id);

    if (saveErr) {
      console.error('Could not save preview:', saveErr.message);
    }

    res.json({
      id: book.id,
      title: book.title,
      author: book.author,
      previewText,
      wordCountEstimate: countWords(previewText)
    });
  } catch (err) {
    console.error('Preview error:', err.name, '-', err.message);

    res.status(502).json({
      error: 'Preview text is temporarily unavailable for this title.'
    });
  }
});
// RELIABLE MULTI-MIRROR BOOK READER
// GET /api/books/:id/read
// ============================================================================

// In-memory cache for recently opened books. This is a performance cache only;
// the durable excerpt cache remains in the Supabase books.preview_text column.
const readCache = new Map();
const READ_CACHE_MAX_ENTRIES = 50;

const BROWSER_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/plain,text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

/** Convert an HTML Gutenberg mirror into readable plain text. */
function stripHtmlToReadableText(html) {
  const namedEntities = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
    mdash: '—', ndash: '–', hellip: '…'
  };

  return String(html)
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>|<br\s*\/?\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ' ';
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      const codePoint = Number(decimal);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ' ';
    })
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name.toLowerCase()] ?? match)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove Project Gutenberg boilerplate and return a paragraph-safe excerpt. */
function cleanAndSliceBookText(rawText, isHtml = false, maxChars = 25000) {
  let text = isHtml ? stripHtmlToReadableText(rawText) : String(rawText || '');

  const startMatch = text.match(
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i
  );
  if (startMatch && typeof startMatch.index === 'number') {
    text = text.slice(startMatch.index + startMatch[0].length);
  }

  const endMatch = text.match(
    /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*/i
  );
  if (endMatch && typeof endMatch.index === 'number') {
    text = text.slice(0, endMatch.index);
  }

  text = text.replace(/\r\n?/g, '\n').trim();
  if (text.length <= maxChars) return text;

  const sliced = text.slice(0, maxChars);
  const lastParagraphBreak = sliced.lastIndexOf('\n\n');
  return (lastParagraphBreak > maxChars * 0.7
    ? sliced.slice(0, lastParagraphBreak)
    : sliced).trim();
}

/** Fetch only the first part of a mirror response, with a per-mirror timeout. */
async function fetchStreamedExcerpt(url, charLimit = 45000) {
  const response = await fetch(url, {
    headers: BROWSER_FETCH_HEADERS,
    signal: AbortSignal.timeout(12000),
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const isHtml = contentType.includes('text/html') || /\.html(?:$|\?)/i.test(url);

  if (!response.body) {
    const fullText = await response.text();
    if (/Temporarily Down for Maintenance/i.test(fullText)) {
      throw new Error('Mirror returned maintenance notice');
    }
    return { text: fullText.slice(0, charLimit), isHtml };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let collected = '';

  try {
    while (collected.length < charLimit) {
      const { done, value } = await reader.read();
      if (done) break;
      collected += decoder.decode(value, { stream: true });

      if (/Temporarily Down for Maintenance/i.test(collected)) {
        throw new Error('Mirror returned maintenance notice');
      }
    }
    collected += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }

  if (/Temporarily Down for Maintenance/i.test(collected)) {
    throw new Error('Mirror returned maintenance notice');
  }

  return { text: collected.slice(0, charLimit), isHtml };
}

app.get('/api/books/:id/read', async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ error: 'Invalid book ID.' });
    }

    // 1. Check in-memory cache.
    if (readCache.has(bookId)) {
      return res.json(readCache.get(bookId));
    }

    // 2. Use the real LumiShelf schema: category_id -> categories relation,
    // and download_url (the existing field used by the admin API).
    const { data: book, error } = await supabase
      .from('books')
      .select('id, title, author, gutenberg_id, download_url, preview_text, categories(name, slug)')
      .eq('id', bookId)
      .maybeSingle();

    if (error) throw error;
    if (!book) {
      return res.status(404).json({ error: 'Book not found in catalog.' });
    }

    const gid = Number(book.gutenberg_id) || null;
    const categoryName = book.categories?.name || 'Classic Literature';
    const fallbackMirrorUrl = gid
      ? `https://www.gutenberg.org/ebooks/${gid}`
      : (book.download_url || null);

    let cleanContent = '';

    // 3. Try independent Project Gutenberg mirrors in order.
    if (gid) {
      const mirrorUrls = [
        `https://gutenberg.pglaf.org/cache/epub/${gid}/pg${gid}.txt`,
        `https://gutenberg.pglaf.org/files/${gid}/${gid}-0.txt`,
        `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`,
        `https://gutenberg.pglaf.org/cache/epub/${gid}/pg${gid}.html`
      ];

      for (const mirrorUrl of mirrorUrls) {
        try {
          const { text: mirrorText, isHtml } = await fetchStreamedExcerpt(mirrorUrl, 45000);
          const candidate = cleanAndSliceBookText(mirrorText, isHtml, 25000);
          if (candidate.length > 300) {
            cleanContent = candidate;
            break;
          }
          throw new Error('Mirror returned too little readable book text');
        } catch (mirrorErr) {
          console.warn(`[Book Reader Mirror Skip] ${mirrorUrl}: ${mirrorErr.message}`);
        }
      }
    }

    // 4. Fall back to the excerpt already stored in Supabase.
    if (!cleanContent && book.preview_text?.trim().length > 50) {
      cleanContent = book.preview_text.trim();
    }

    // 5. If no text mirror or cached preview exists, provide a clear fallback.
    if (!cleanContent) {
      cleanContent = `${book.title}\nBy ${book.author}\nCategory: ${categoryName}\n\nThe external book text mirrors are temporarily unavailable. Your book record remains in LumiShelf. Please try again later or use the available authorized book link.`;
    } else if (!book.preview_text || book.preview_text.trim().length < 200) {
      // Persist a bounded excerpt for future reads; report but do not fail on cache errors.
      const { error: updateErr } = await supabase
        .from('books')
        .update({ preview_text: cleanContent.slice(0, 8000) })
        .eq('id', book.id);

      if (updateErr) {
        console.warn('[Book Reader Cache Save Warning]:', updateErr.message);
      }
    }

    const payload = {
      id: book.id,
      title: book.title,
      author: book.author,
      category: categoryName,
      content: cleanContent,
      fallbackMirrorUrl
    };

    readCache.set(bookId, payload);
    if (readCache.size > READ_CACHE_MAX_ENTRIES) {
      const oldestKey = readCache.keys().next().value;
      if (oldestKey !== undefined) readCache.delete(oldestKey);
    }

    return res.json(payload);
  } catch (err) {
    console.error('[GET /api/books/:id/read Error]:', err);
    return res.status(500).json({
      error: 'Unable to load book content right now.',
      details: err.message
    });
  }
});

// ================= Role-based download quotas + admin API =================

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Determine user role from verified login
async function getRole(user) {
  if (!user) return 'guest';

  if (ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
    return 'admin';
  }

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return data?.role === 'admin' ? 'admin' : 'user';
}

// Get download quota
async function getQuota(req) {
  const role = await getRole(req.user);
  const deviceId = req.headers['x-device-id'];

  if (role === 'guest' && !deviceId) {
    return {
      role,
      used: 0,
      limit: LIMITS.guest,
      remaining: LIMITS.guest,
      unlimited: false
    };
  }

  let q = supabase
    .from('downloads')
    .select('*', { count: 'exact', head: true });

  q = req.user
    ? q.eq('user_id', req.user.id)
    : q.eq('device_id', deviceId);

  const { count } = await q;

  const used = count ?? 0;

  if (role === 'admin') {
    return {
      role,
      used,
      limit: null,
      remaining: null,
      unlimited: true
    };
  }

  const limit = role === 'user'
    ? LIMITS.user
    : LIMITS.guest;

  return {
    role,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    unlimited: false
  };
}

// Quota status
app.get(
  ['/api/usage', '/api/user/quota'],
  async (req, res) => {
    try {
      const q = await getQuota(req);

      res.json({
        used: q.used,
        limit: q.limit,
        remaining: q.remaining,
        role: q.role,
        mode: q.role === 'guest' ? 'guest' : 'user'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Download route
app.post('/api/books/:id/download', downloadRateLimiter, async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];

    if (!req.user && !deviceId) {
      return res.status(400).json({
        error: 'Guests must send an x-device-id header'
      });
    }

    const q = await getQuota(req);

    if (!q.unlimited && q.used >= q.limit) {
      return res.status(403).json({
        error: 'Download limit reached',
        used: q.used,
        limit: q.limit,
        remaining: 0,
        role: q.role
      });
    }

    const { data: book } = await supabase
      .from('books')
      .select('id, title, download_url')
      .eq('id', req.params.id)
      .single();

    if (!book) {
      return res.status(404).json({
        error: 'Book not found'
      });
    }

    const { error: downloadErr } = await supabase
      .from('downloads')
      .insert({
        user_id: req.user ? req.user.id : null,
        device_id: req.user ? null : deviceId,
        book_id: book.id
      });

    if (downloadErr) {
      return res.status(500).json({
        error: downloadErr.message
      });
    }

    const used = q.used + 1;

    res.json({
      title: book.title,
      download_url: book.download_url,
      used,
      limit: q.limit,
      remaining: q.unlimited
        ? null
        : Math.max(0, q.limit - used),
      role: q.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ================= ADMIN API =================

async function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Please log in'
    });
  }

  if ((await getRole(req.user)) !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: admins only'
    });
  }

  next();
}

const isHttp = (u) => /^https?:\/\/\S+$/i.test(u || '');

// Resolve category ID
async function resolveCategoryId(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  if (/^\d+$/.test(String(value))) {
    return Number(value);
  }

  for (const column of ['name', 'slug']) {
    const { data } = await supabase
      .from('categories')
      .select('id')
      .ilike(column, String(value))
      .limit(1)
      .maybeSingle();

    if (data) return data.id;
  }

  return null;
}

// Validate and map admin form fields
async function cleanBookInput(body = {}, isNew) {
  const f = {};

  if (isNew || body.title !== undefined) {
    const title = String(body.title ?? '')
      .trim()
      .slice(0, 200);

    if (!title) {
      return { error: 'Title is required' };
    }

    f.title = title;
  }

  if (isNew || body.author !== undefined) {
    const author = String(body.author ?? '')
      .trim()
      .slice(0, 150);

    if (!author) {
      return { error: 'Author is required' };
    }

    f.author = author;
  }

  if (body.category !== undefined) {
    f.category_id = await resolveCategoryId(body.category);
  }

  if (body.popularity !== undefined) {
    const p = Number.parseInt(body.popularity, 10);

    f.popularity = Number.isFinite(p) && p >= 0
      ? p
      : 0;
  }

  for (const [key, column] of [
    ['cover_url', 'cover_url'],
    ['epub_url', 'download_url']
  ]) {
    const raw = String(body[key] ?? '').trim();

    if (raw) {
      if (!isHttp(raw)) {
        return {
          error: `${key} must start with http:// or https://`
        };
      }

      f[column] = raw;
    }
  }

  return { fields: f };
}

// Admin analytics
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.rpc('admin_analytics');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  let topBooks = data.topBooks || [];
  let topBooksBasis = 'downloads';

  if (topBooks.length === 0) {
    const { data: pop } = await supabase
      .from('books')
      .select('id, title, author, cover_url, popularity')
      .order('popularity', { ascending: false })
      .limit(5);

    topBooks = (pop || []).map((b) => ({
      ...b,
      downloads: 0
    }));

    topBooksBasis = 'popularity';
  }

  res.json({
    ...data,
    topBooks,
    topBooksBasis
  });
});

// Get all books for admin
app.get('/api/admin/books', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('books')
    .select('id, title, author, cover_url, download_url, gutenberg_id, popularity, category_id, categories(name, slug)')
    .order('title')
    .range(0, 999);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// Add a new book
app.post('/api/admin/books', requireAdmin, async (req, res) => {
  const { fields, error } = await cleanBookInput(req.body, true);

  if (error) {
    return res.status(400).json({ error });
  }

  const gid = Number.parseInt(req.body?.gutenberg_id, 10);

  if (Number.isFinite(gid) && gid > 0) {
    fields.gutenberg_id = gid;

    fields.cover_url ??=
      `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.cover.medium.jpg`;

    fields.download_url ??=
      `https://www.gutenberg.org/ebooks/${gid}.epub3.images`;

    fields.source_url =
      `https://www.gutenberg.org/ebooks/${gid}`;

    fields.source_name = 'Project Gutenberg';
  }

  if (!fields.download_url) {
    return res.status(400).json({
      error: 'Provide an EPUB URL or a Gutenberg ID'
    });
  }

  fields.language ??= 'en';
  fields.license ??= 'Public Domain';
  fields.source_name ??= 'Admin upload';
  fields.popularity ??= 0;

  const { data, error: dbErr } = await supabase
    .from('books')
    .insert(fields)
    .select('*, categories(name, slug)')
    .single();

  if (dbErr) {
    const duplicate = dbErr.code === '23505';

    return res.status(duplicate ? 409 : 500).json({
      error: duplicate
        ? 'A book with that Gutenberg ID already exists'
        : dbErr.message
    });
  }

  res.status(201).json(data);
});

// Update a book
app.put('/api/admin/books/:id', requireAdmin, async (req, res) => {
  const { fields, error } = await cleanBookInput(req.body, false);

  if (error) {
    return res.status(400).json({ error });
  }

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({
      error: 'Nothing to update'
    });
  }

  const { data, error: dbErr } = await supabase
    .from('books')
    .update(fields)
    .eq('id', req.params.id)
    .select('*, categories(name, slug)');

  if (dbErr) {
    return res.status(500).json({ error: dbErr.message });
  }

  if (!data?.length) {
    return res.status(404).json({
      error: 'Book not found'
    });
  }

  res.json(data[0]);
});

// Delete a book
app.delete('/api/admin/books/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('books')
    .delete()
    .eq('id', req.params.id)
    .select('id, title');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!data?.length) {
    return res.status(404).json({
      error: 'Book not found'
    });
  }

  res.json({
    deleted: true,
    id: data[0].id,
    title: data[0].title
  });
});

// LUMI AI — FAST AGENTIC ASSISTANT + ONE-STEP AUTO-SAVE
// Shared endpoint for the React web app and Android application.
// ============================================================================

/** Lazily initialize Gemini so other API routes can start without an API key. */
let lumiAiClient;
function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || '')
    .replace(/^['"]|['"]$/g, '')
    .trim();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing or empty in backend/.env');
  }

  if (!lumiAiClient) {
    lumiAiClient = new GoogleGenAI({ apiKey });
  }
  return lumiAiClient;
}

const LUMI_SYSTEM_INSTRUCTION = `
You are Lumi AI, the intelligent assistant for LumiShelf, a modern digital library.
Help users discover, compare, and save books from the real LumiShelf database quickly and accurately.

STRICT RULES:
1. ZERO HALLUCINATION: Never invent books. Use search_books, get_book_details, or compare_books to ground book information in the actual database.
2. DIRECT AUTO-SAVE: When an authenticated user explicitly asks to save, favorite, or add a book to My Library, call save_book_to_favorites directly using its exact title if known, or its book_id if already known. Do not ask for a second confirmation. If the title is ambiguous, ask the user which matching book they mean instead of guessing.
3. GUEST PROTECTION: If save_book_to_favorites returns AUTH_REQUIRED, politely invite the Guest to sign in or create a free Reader account.
4. CATALOG ACCURACY: Do not claim a book is available to download unless its record has an authorized download URL.
5. CLEAN FORMATTING: Do not use headings with # symbols, dash bullets, asterisk bullets, or horizontal dividers. Use numbered items with blank lines between items. Use **double asterisks** only around book titles, author names, and key labels such as Category: or Why read it:.
6. Be concise, warm, scholarly, and helpful.
`.trim();

const lumiToolDeclarations = [
  {
    functionDeclarations: [
      {
        name: 'search_books',
        description: 'Search the LumiShelf catalog by title, author, or category. Use an empty query or popular for popular books.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'Search keyword for title, author, or category. Use an empty string for popular books.'
            },
            category: {
              type: Type.STRING,
              description: 'Optional category name or slug, such as Science, Philosophy, or Fiction.'
            },
            limit: {
              type: Type.INTEGER,
              description: 'Maximum books to return, default 5 and maximum 10.'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_book_details',
        description: 'Get metadata and the opening excerpt for a book by its LumiShelf database ID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            book_id: {
              type: Type.INTEGER,
              description: 'Numeric ID of the book.'
            }
          },
          required: ['book_id']
        }
      },
      {
        name: 'compare_books',
        description: 'Compare two or more books by their numeric LumiShelf database IDs.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            book_ids: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: 'Array of numeric book IDs to compare.'
            }
          },
          required: ['book_ids']
        }
      },
      {
        name: 'save_book_to_favorites',
        description: 'Immediately save a book to the authenticated user My Library. Accept either an exact book title or a known book_id. Use only when the user explicitly asks to save/favorite/add the book.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            book_id: {
              type: Type.INTEGER,
              description: 'Numeric ID of the book, when already known.'
            },
            title: {
              type: Type.STRING,
              description: 'Book title to look up and save directly, such as Anna Karenina.'
            }
          }
        }
      }
    ]
  }
];

// Reuse the global authentication middleware above. req.user is populated only
// after Supabase verifies the Authorization: Bearer token.
function getAuthenticatedUserId(req) {
  return req.user?.id || null;
}

async function findLumiCategories(value) {
  const safe = String(value || '').replace(/[,%()]/g, ' ').trim();
  if (!safe) return [];

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug')
    .or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
    .limit(10);

  if (error) throw error;
  return data || [];
}

async function executeLumiTool(name, args, userId, stateFlags) {
  console.log(`[Lumi AI Tool] -> ${name}(${JSON.stringify(args)})`);

  try {
    // TOOL 1: Search actual books and their related categories.
    if (name === 'search_books') {
      const rawQuery = String(args?.query || '').trim();
      const category = String(args?.category || '').trim();
      const limit = Math.min(Math.max(Number(args?.limit) || 5, 1), 10);
      const selectFields = 'id, title, author, category_id, popularity, gutenberg_id, preview_text, download_url, categories(name, slug)';

      let categoryIds = [];
      if (category) {
        const matches = await findLumiCategories(category);
        categoryIds = matches.map((item) => item.id);
        if (!categoryIds.length) {
          return { count: 0, books: [], message: 'No matching category exists in LumiShelf.' };
        }
      }

      const broadTerms = ['', 'all', 'books', 'popular', 'trending', 'recommend', 'any'];
      const isBroadSearch = broadTerms.includes(rawQuery.toLowerCase());
      let results = [];

      if (isBroadSearch) {
        let query = supabase
          .from('books')
          .select(selectFields)
          .order('popularity', { ascending: false })
          .order('title')
          .limit(limit);
        if (categoryIds.length) query = query.in('category_id', categoryIds);

        const { data, error } = await query;
        if (error) throw error;
        results = data || [];
      } else {
        const safe = rawQuery.replace(/[,%()_*]/g, ' ').trim();
        let query = supabase
          .from('books')
          .select(selectFields)
          .or(`title.ilike.%${safe}%,author.ilike.%${safe}%`)
          .order('popularity', { ascending: false })
          .limit(limit);
        if (categoryIds.length) query = query.in('category_id', categoryIds);

        const { data, error } = await query;
        if (error) throw error;
        results = data || [];

        // Also interpret a search phrase as a category name/slug.
        if (!categoryIds.length) {
          const matchingCategories = await findLumiCategories(safe);
          const matchingIds = matchingCategories.map((item) => item.id);
          if (matchingIds.length) {
            const { data: categoryBooks, error: categoryError } = await supabase
              .from('books')
              .select(selectFields)
              .in('category_id', matchingIds)
              .order('popularity', { ascending: false })
              .limit(limit);
            if (categoryError) throw categoryError;
            results = [...results, ...(categoryBooks || [])];
          }
        }
      }

      const uniqueBooks = [...new Map(results.map((book) => [book.id, book])).values()].slice(0, limit);
      return {
        count: uniqueBooks.length,
        books: uniqueBooks.map((book) => ({
          ...book,
          category: book.categories?.name || 'Uncategorized'
        }))
      };
    }

    // TOOL 2: Get detailed metadata and preview text.
    if (name === 'get_book_details') {
      const bookId = Number(args?.book_id);
      if (!Number.isInteger(bookId) || bookId <= 0) return { error: 'Invalid book_id.' };

      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, category_id, popularity, gutenberg_id, preview_text, download_url, categories(name, slug)')
        .eq('id', bookId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { error: `Book ID ${bookId} was not found in LumiShelf.` };

      return {
        id: data.id,
        title: data.title,
        author: data.author,
        category: data.categories?.name || 'Uncategorized',
        popularity: data.popularity,
        gutenberg_id: data.gutenberg_id,
        has_download: Boolean(data.download_url),
        opening_excerpt: data.preview_text
          ? data.preview_text.slice(0, 600)
          : 'Opening excerpt not yet cached for this title.'
      };
    }

    // TOOL 3: Compare books using their actual database records.
    if (name === 'compare_books') {
      const bookIds = Array.isArray(args?.book_ids)
        ? [...new Set(args.book_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
        : [];
      if (bookIds.length < 2) return { error: 'Provide at least two valid book IDs to compare.' };

      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, category_id, popularity, gutenberg_id, preview_text, categories(name, slug)')
        .in('id', bookIds);
      if (error) throw error;

      const books = (data || []).map((book) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.categories?.name || 'Uncategorized',
        popularity: book.popularity,
        gutenberg_id: book.gutenberg_id,
        opening_excerpt: book.preview_text
          ? book.preview_text.slice(0, 400)
          : 'No opening excerpt cached.'
      }));
      return { compared_count: books.length, books };
    }

    // TOOL 4: Direct title-or-ID auto-save to the existing favorites table.
    if (name === 'save_book_to_favorites') {
      if (!userId) {
        stateFlags.authRequired = true;
        return {
          status: 'AUTH_REQUIRED',
          message: 'The user is browsing as a Guest. Explain that saving books to My Library requires a free Reader account.'
        };
      }

      const numericId = Number(args?.book_id);
      const titleQuery = String(args?.title || '').trim();
      let targetBook = null;

      if (Number.isInteger(numericId) && numericId > 0) {
        const { data, error } = await supabase
          .from('books')
          .select('id, title, author')
          .eq('id', numericId)
          .maybeSingle();
        if (error) throw error;
        targetBook = data;
      } else if (titleQuery) {
        // Prefer a case-insensitive exact title. If not found, allow a partial
        // match only when it identifies exactly one catalog title.
        const { data: exactMatches, error: exactError } = await supabase
          .from('books')
          .select('id, title, author')
          .ilike('title', titleQuery)
          .limit(3);
        if (exactError) throw exactError;

        if (exactMatches?.length === 1) {
          targetBook = exactMatches[0];
        } else if ((exactMatches?.length || 0) > 1) {
          return {
            status: 'NEEDS_CLARIFICATION',
            matches: exactMatches.map((book) => ({ id: book.id, title: book.title, author: book.author }))
          };
        } else {
          const safeTitle = titleQuery.replace(/[,%()_*]/g, ' ').trim();
          const { data: partialMatches, error: partialError } = await supabase
            .from('books')
            .select('id, title, author')
            .ilike('title', `%${safeTitle}%`)
            .order('popularity', { ascending: false })
            .limit(6);
          if (partialError) throw partialError;

          if (partialMatches?.length === 1) {
            targetBook = partialMatches[0];
          } else if ((partialMatches?.length || 0) > 1) {
            return {
              status: 'NEEDS_CLARIFICATION',
              matches: partialMatches.map((book) => ({ id: book.id, title: book.title, author: book.author }))
            };
          }
        }
      } else {
        return { error: 'Provide either a valid book_id or a book title.' };
      }

      if (!targetBook) {
        return { status: 'NOT_FOUND', error: `No matching book was found for ${titleQuery || `ID ${numericId}`} in LumiShelf.` };
      }

      // Check existing favorite so the user gets an accurate save status.
      const { data: existing, error: existingError } = await supabase
        .from('favorites')
        .select('book_id')
        .eq('user_id', userId)
        .eq('book_id', targetBook.id)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing) {
        stateFlags.libraryUpdated = true;
        stateFlags.savedBookTitle = targetBook.title;
        stateFlags.savedStatus = 'ALREADY_SAVED';
        return {
          status: 'ALREADY_SAVED',
          book_id: targetBook.id,
          title: targetBook.title,
          author: targetBook.author,
          message: `${targetBook.title} is already in your My Library.`
        };
      }

      const { error: saveError } = await supabase
        .from('favorites')
        .upsert(
          { user_id: userId, book_id: targetBook.id },
          { onConflict: 'user_id,book_id' }
        );
      if (saveError) throw saveError;

      console.log(`[Lumi AI Save] Saved "${targetBook.title}" for user ${userId}`);
      stateFlags.libraryUpdated = true;
      stateFlags.savedBookTitle = targetBook.title;
      stateFlags.savedStatus = 'SAVED';

      return {
        status: 'SAVED',
        book_id: targetBook.id,
        title: targetBook.title,
        author: targetBook.author,
        message: `Saved "${targetBook.title}" by ${targetBook.author} to My Library.`
      };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    console.error(`[Lumi AI Tool Error] ${name}:`, err.message);
    return { error: `Database tool execution failed: ${err.message}` };
  }
}

// AI health endpoint: confirms route is alive and whether a key is configured.
app.get('/api/ai/health', (req, res) => {
  const cleanKey = (process.env.GEMINI_API_KEY || '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
  res.json({ status: 'ok', agent: 'Lumi AI', hasApiKey: Boolean(cleanKey) });
});


// ============================================================================
// AI HEALTH ENDPOINT
// ============================================================================
app.get('/api/ai/health', (req, res) => {
  const cleanKey = (process.env.GEMINI_API_KEY || '')
    .replace(/^['"]|['"]$/g, '')
    .trim();

  res.json({
    status: 'ok',
    agent: 'Lumi AI',
    hasApiKey: Boolean(cleanKey)
  });
});


// ============================================================================
// SHARED AGENTIC AI ENDPOINT FOR REACT WEB AND ANDROID
// ============================================================================

// Models are tried in order; the first one that works is remembered.
const LUMI_MODELS = [
  {
    model: 'gemini-2.5-flash',
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0.25
    }
  },
  {
    model: 'gemini-3.5-flash-lite',
    config: {
      thinkingConfig: { thinkingLevel: 'minimal' }
    }
  }
];

let lumiModelIndex = 0;

const MODEL_UNAVAILABLE =
  /not found|404|permission|403|no longer available|not supported|has not been used/i;


// ============================================================================
// GEMINI MODEL GENERATION WITH AUTOMATIC FALLBACK
// ============================================================================
async function lumiGenerate(ai, contents, withTools = true) {
  let lastErr;

  for (let i = lumiModelIndex; i < LUMI_MODELS.length; i += 1) {
    const { model, config } = LUMI_MODELS[i];

    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...config,
          systemInstruction: LUMI_SYSTEM_INSTRUCTION,
          ...(withTools ? { tools: lumiToolDeclarations } : {}),
          maxOutputTokens: 650
        }
      });

      return response;

    } catch (err) {
      lastErr = err;

      console.warn(`[Lumi AI] ${model} failed: ${err.message}`);

      // Remember the switch only when the model itself is unavailable.
      if (
        MODEL_UNAVAILABLE.test(err.message) &&
        i === lumiModelIndex &&
        i < LUMI_MODELS.length - 1
      ) {
        lumiModelIndex = i + 1;

        console.warn(
          `[Lumi AI] Now using ${LUMI_MODELS[lumiModelIndex].model} for all requests.`
        );
      }
    }
  }

  throw lastErr;
}


// ============================================================================
// LUMI AI CHAT ROUTE
// ============================================================================
app.post('/api/ai/chat', aiChatRateLimiter, async (req, res) => {
  const startedAt = Date.now();

  try {
    const ai = getGeminiClient();
    const { message, history = [] } = req.body || {};

    // Validate incoming message.
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: 'Message text is required.'
      });
    }

    const userId = getAuthenticatedUserId(req);

    // Keep only the latest six conversation turns.
    const safeHistory = Array.isArray(history) ? history.slice(-6) : [];
    const contents = [];

    for (const turn of safeHistory) {
      if (turn?.text && (turn.role === 'user' || turn.role === 'model')) {
        contents.push({
          role: turn.role,
          parts: [
            { text: String(turn.text).slice(0, 4000) }
          ]
        });
      }
    }

    // Add the latest user message.
    contents.push({
      role: 'user',
      parts: [
        { text: message.trim().slice(0, 4000) }
      ]
    });

    const executedToolNames = [];

    const stateFlags = {
      libraryUpdated: false,
      authRequired: false,
      savedBookTitle: null,
      savedStatus: null
    };

    let finalText = '';
    let endedOnToolCall = false;

    const MAX_AGENT_STEPS = 4;

    // ========================================================================
    // AGENT TOOL-CALLING LOOP
    // ========================================================================
    for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
      const response = await lumiGenerate(ai, contents);
      const functionCalls = response.functionCalls || [];

      // Gemini returned a normal text response.
      if (!functionCalls.length) {
        finalText = String(response.text || '').trim();
        endedOnToolCall = false;
        break;
      }

      endedOnToolCall = true;

      // Preserve Gemini's original model response and thought signatures.
      const modelContent = response.candidates?.[0]?.content;

      if (modelContent) {
        contents.push({
          role: modelContent.role || 'model',
          parts: modelContent.parts || []
        });
      }

      // Execute all requested tools concurrently.
      const functionResponseParts = await Promise.all(
        functionCalls.map(async (call) => {
          executedToolNames.push(call.name);

          const toolResult = await executeLumiTool(
            call.name,
            call.args || {},
            userId,
            stateFlags
          );

          return {
            functionResponse: {
              name: call.name,
              response: toolResult
            }
          };
        })
      );

      // Send tool results back to Gemini.
      contents.push({
        role: 'user',
        parts: functionResponseParts
      });
    }

    // ========================================================================
    // FINAL RESPONSE AFTER TOOL EXECUTION
    // ========================================================================
    if (!finalText && endedOnToolCall) {
      const wrapUp = await lumiGenerate(ai, contents, false);
      finalText = String(wrapUp.text || '').trim();
    }

    // Fallback if Gemini completes the save but returns no final text.
    if (!finalText && stateFlags.savedBookTitle) {
      finalText = stateFlags.savedStatus === 'ALREADY_SAVED'
        ? `**${stateFlags.savedBookTitle}** is already saved in your My Library.`
        : `I saved **${stateFlags.savedBookTitle}** to your My Library.`;
    }

    if (!finalText) {
      finalText =
        'I checked the LumiShelf catalog. What would you like to explore next?';
    }

    // Log response details.
    console.log(
      `[Lumi AI] replied in ${Date.now() - startedAt}ms ` +
      `(${LUMI_MODELS[lumiModelIndex].model}, tools: ${executedToolNames.join(', ') || 'none'})`
    );

    // Return response to React Web and Android.
    return res.json({
      reply: finalText,
      toolsUsed: [...new Set(executedToolNames)],
      libraryUpdated: stateFlags.libraryUpdated,
      authRequired: stateFlags.authRequired,
      awaitingConfirmation: false
    });

  } catch (err) {
    console.error('[Lumi AI Endpoint Error]:', err);

    return res.status(500).json({
      error: 'Lumi AI encountered an error processing your request.',
      details: err.message
    });
  }
});


// ============================================================================
// START LUMISHELF BACKEND SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log(`LumiShelf Backend running on http://localhost:${PORT}`);
  console.log('Lumi AI Agent ready: GET /api/ai/health & POST /api/ai/chat');
  console.log('Book Reader ready: GET /api/books/:id/read');
  console.log('Security headers and AI/download rate limits active.');
});

 
// ============================================================================
// START LUMISHELF BACKEND SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log(`LumiShelf Backend running on http://localhost:${PORT}`);
  console.log('Lumi AI Agent ready: GET /api/ai/health & POST /api/ai/chat');
  console.log('Book Reader ready: GET /api/books/:id/read');
  console.log('Security headers and AI/download rate limits active.');
});