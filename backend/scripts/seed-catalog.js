import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CATALOG_URL = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv';

// A book goes to the FIRST category it matches, so the order matters.
const PLAN = [
  { name: 'Mystery & Detective', slug: 'mystery',    target: 20, match: [/detective and mystery/, /mystery fiction/, /detective fiction/] },
  { name: 'Adventure',           slug: 'adventure',  target: 25, match: [/adventure/, /sea stories/] },
  { name: 'Poetry',              slug: 'poetry',     target: 20, match: [/poetry/, /\bpoems\b/] },
  { name: 'Drama',               slug: 'drama',      target: 15, match: [/\bdrama\b/, /\bplays\b/, /tragedies/] },
  { name: 'Philosophy',          slug: 'philosophy', target: 25, match: [/philosophy/, /\bethics\b/, /metaphysics/, /\bstoic/] },
  { name: 'Biography',           slug: 'biography',  target: 15, match: [/biography/, /memoirs/, /\bdiaries\b/] },
  { name: 'Technology',          slug: 'technology', target: 15, match: [/engineering/, /technology/, /machinery/, /inventions/, /electricity/, /telegraph/] },
  { name: 'Science',             slug: 'science',    target: 25, match: [/natural history/, /physics/, /chemistry/, /astronomy/, /evolution/, /biology/, /geology/, /botany/, /zoology/, /mathematics/] },
  { name: 'History',             slug: 'history',    target: 25, match: [/history/] },
  { name: 'Fiction',             slug: 'fiction',    target: 40, match: [/fiction/, /\bnovel/, /\bstories\b/, /romance/] },
];

// Well-known classics get picked first
const CLASSICS = new Set([
  1342, 84, 11, 345, 2701, 1661, 98, 1400, 174, 76, 74, 1260, 768, 120, 35, 36, 55, 16,
  244, 1232, 205, 996, 2554, 2600, 5200, 1497, 2680, 132, 2009, 1322,
]);

async function download(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries - 1) throw err;
      console.log(`  retrying (${err.message})...`);
      await sleep(3000 * (i + 1));
    }
  }
}

// "Austen, Jane, 1775-1817" -> "Jane Austen"
function cleanAuthor(raw) {
  const first = (raw || '').split(';')[0];
  const parts = first
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !/^(\d|b\.|d\.|fl\.|ca\.|active)/i.test(s));
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`;
  return parts[0] || 'Unknown';
}

console.log('Downloading the Project Gutenberg catalog (about 14 MB)...');
const csv = await download(CATALOG_URL);
const records = parse(csv, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
console.log(`Catalog loaded: ${records.length} entries`);

// Keep English text books, drop partial volumes and periodicals
const candidates = records
  .filter((r) => r.Type === 'Text' && r.Language === 'en')
  .filter((r) => !/\b(vol\.|volume)\b/i.test(r.Title) && !/periodicals/i.test(r.Subjects || ''))
  .map((r) => {
    const id = Number(r['Text#']);
    const shelves = r.Bookshelves || '';
    return {
      id,
      title: (r.Title || '').replace(/\s+/g, ' ').trim(),
      authors: r.Authors,
      subjects: r.Subjects || '',
      haystack: `${r.Subjects || ''} ${shelves}`.toLowerCase(),
      score: (CLASSICS.has(id) ? 1000 : 0) + (/best books ever/i.test(shelves) ? 100 : 0),
    };
  })
  .filter((b) => b.id && b.title);

const used = new Set();
const seenTitles = new Set();

for (const cat of PLAN) {
  console.log(`\n${cat.name}`);
  const { data: category, error: catErr } = await supabase
    .from('categories')
    .upsert({ name: cat.name, slug: cat.slug }, { onConflict: 'slug' })
    .select()
    .single();
  if (catErr) { console.error('Category error:', catErr.message); process.exit(1); }

  const pool = candidates
    .filter((b) => !used.has(b.id) && cat.match.some((rx) => rx.test(b.haystack)))
    .sort((a, b) => b.score - a.score || a.id - b.id);

  const rows = [];
  for (const b of pool) {
    if (rows.length >= cat.target) break;
    const key = b.title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    used.add(b.id);
    rows.push({
      gutenberg_id: b.id,
      title: b.title.slice(0, 200),
      author: cleanAuthor(b.authors),
      subjects: b.subjects.slice(0, 500),
      cover_url: `https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.cover.medium.jpg`,
      source_name: 'Project Gutenberg',
      source_url: `https://www.gutenberg.org/ebooks/${b.id}`,
      download_url: `https://www.gutenberg.org/ebooks/${b.id}.epub3.images`,
      language: 'en',
      license: 'Public Domain',
      popularity: b.score,
      category_id: category.id,
    });
  }

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase.from('books').upsert(rows.slice(i, i + 50), { onConflict: 'gutenberg_id' });
    if (error) { console.error('Insert error:', error.message); process.exit(1); }
  }
  console.log(`  saved ${rows.length} books`);
}

const { count } = await supabase.from('books').select('*', { count: 'exact', head: true });
console.log(`\nDone. The library now holds ${count} books.`);
if (count < 200) console.log('Below 200: raise some "target" numbers in PLAN and run the script again.');