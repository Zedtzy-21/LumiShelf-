import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const API = `http://localhost:${process.env.PORT || 5000}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: books, error } = await supabase
  .from('books')
  .select('id, title')
  .is('preview_text', null)
  .order('popularity', { ascending: false });
if (error) { console.error(error.message); process.exit(1); }

console.log(`${books.length} books still need a saved preview`);
let ok = 0, failed = 0;
for (const [i, b] of books.entries()) {
  try {
    const res = await fetch(`${API}/api/books/${b.id}/preview`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ok++;
    console.log(`[${i + 1}/${books.length}] saved: ${b.title}`);
  } catch (e) {
    failed++;
    console.log(`[${i + 1}/${books.length}] FAILED: ${b.title} (${e.message})`);
  }
  await sleep(1500); // be gentle with the source
}
console.log(`Done. Saved ${ok}, failed ${failed}. Run it again to retry the failed ones.`);