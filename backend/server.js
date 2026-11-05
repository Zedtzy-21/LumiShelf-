import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());          // lets the web and mobile apps call this API
app.use(express.json());  // lets us read JSON request bodies

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LIMITS = { guest: 5, user: 10 };

// Middleware: if the request has a login token, find out who the user is.
// No token = a guest. We do not block here, we just identify.
async function identifyUser(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    req.user = data?.user ?? null;
  }
  next();
}
app.use(identifyUser);

// 1. Health check: proves the server is alive
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'LumiShelf API' });
});

// 2. Categories for the filter chips
app.get('/api/categories', async (req, res) => {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 3. Books, with optional ?category=ID and ?q=search text
app.get('/api/books', async (req, res) => {
  const { category, q } = req.query;
  let query = supabase
    .from('books')
    .select('*, categories(name, slug)')
    .order('title');

  if (category) query = query.eq('category_id', category);
  if (q) {
    const safe = String(q).replace(/[,()]/g, ' ');
    query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// 4. Download: THE rule. Guest = 5, registered = 10, enforced here.
app.post('/api/books/:id/download', async (req, res) => {
  const isUser = Boolean(req.user);
  const deviceId = req.headers['x-device-id'];

  if (!isUser && !deviceId) {
    return res.status(400).json({ error: 'Guests must send an x-device-id header' });
  }

  const limit = isUser ? LIMITS.user : LIMITS.guest;

  // Count this person's previous downloads (by user_id or device_id)
  let countQuery = supabase
    .from('downloads')
    .select('*', { count: 'exact', head: true });
  countQuery = isUser
    ? countQuery.eq('user_id', req.user.id)
    : countQuery.eq('device_id', deviceId);
  const { count } = await countQuery;

  if (count >= limit) {
    return res.status(403).json({ error: 'Download limit reached', used: count, limit });
  }

  const { data: book } = await supabase
    .from('books')
    .select('id, title, download_url')
    .eq('id', req.params.id)
    .single();
  if (!book) return res.status(404).json({ error: 'Book not found' });

  await supabase.from('downloads').insert({
    user_id: isUser ? req.user.id : null,
    device_id: isUser ? null : deviceId,
    book_id: book.id,
  });

  res.json({ title: book.title, download_url: book.download_url, used: count + 1, limit });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`LumiShelf API running on http://localhost:${port}`));