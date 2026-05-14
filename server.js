const express = require('express');
const path = require('path');
const { processAll } = require('./lib/processor');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required');
}

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Supabase helpers ──────────────────────────────────────────────────────────

const sbHeaders = () => ({
  'Content-Type': 'application/json',
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
});

async function insertRows(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/letter_texts`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert error (${res.status}): ${err}`);
  }
  return res.json();
}

async function getRowsByIds(ids) {
  const idList = ids.join(',');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/letter_texts?id=in.(${idList})&select=id,descr,text,final_HTML`,
    { headers: sbHeaders() }
  );
  if (!res.ok) throw new Error(`Supabase query error (${res.status})`);
  return res.json();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/queue
// Body: { rows: [{ descr, text, image_URL, CTA_URL, template }] }
// Inserts rows into Supabase with final_HTML = null, triggers n8n webhook
app.post('/api/queue', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Provide at least one row' });
    }

    const payload = rows.map((r) => ({
      template:  r.template  || null,
      image_URL: r.image_URL || null,
      text:      r.text      || null,
      CTA_URL:   r.CTA_URL   || null,
      descr:     r.descr     || null,
      final_HTML: null,
    }));

    const inserted = await insertRows(payload);
    const ids = inserted.map((r) => r.id);

    // Fire-and-forget processing in background
    processAll(SUPABASE_URL, SUPABASE_SERVICE_KEY).catch((e) =>
      console.error('processAll error:', e.message)
    );

    console.log(`Queued ${ids.length} rows: [${ids.join(', ')}] — processing started`);
    res.json({ ids, processing: true });
  } catch (e) {
    console.error('/api/queue error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/status?ids=1,2,3
// Returns progress info for given IDs
app.get('/api/status', async (req, res) => {
  try {
    const ids = (req.query.ids || '')
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (ids.length === 0) return res.status(400).json({ error: 'No valid IDs' });

    const rows = await getRowsByIds(ids);

    res.json(
      rows.map((r) => ({
        id:       r.id,
        descr:    r.descr,
        done:     !!r.final_HTML,
        textSnip: r.text ? r.text.slice(0, 120).replace(/\n/g, ' ') : '',
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/result/:id
// Returns full final_HTML for preview / download
app.get('/api/result/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const rows = await getRowsByIds([id]);
    if (!rows.length) return res.status(404).json({ error: 'Row not found' });

    const row = rows[0];
    if (!row.final_HTML) return res.status(202).json({ id, done: false });

    res.json({ id, descr: row.descr, final_HTML: row.final_HTML });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/process
// Manually trigger processing of all pending rows (final_HTML = null)
app.post('/api/process', async (_req, res) => {
  try {
    const result = await processAll(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    res.json(result);
  } catch (e) {
    console.error('/api/process error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check for Railway
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Email Layout Builder running on port ${PORT}`);
});
