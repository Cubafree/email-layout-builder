'use strict';

const { extractEmailContent } = require('./openrouter');
const { buildHtml } = require('./htmlBuilder');

let isRunning = false;

async function fetchPendingRows(supabaseUrl, headers, limit = 30) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/letter_texts?final_HTML=is.null&select=id,text,template,image_URL,CTA_URL,descr&limit=${limit}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Supabase fetch error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function updateFinalHtml(supabaseUrl, headers, id, finalHtml) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/letter_texts?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ final_HTML: finalHtml }),
    }
  );
  if (!res.ok) throw new Error(`Supabase update error (${res.status}): ${await res.text()}`);
}

async function markError(supabaseUrl, headers, id, errorMsg) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/letter_texts?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ final_HTML: `ERROR: ${errorMsg}` }),
    }
  );
  if (!res.ok) console.error(`Failed to mark error for row ${id}`);
}

// Returns { processed, errors, skipped }
async function processAll(supabaseUrl, supabaseKey) {
  if (isRunning) return { skipped: true, reason: 'Already running' };
  isRunning = true;

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  const results = { processed: 0, errors: [] };

  try {
    const rows = await fetchPendingRows(supabaseUrl, headers);
    console.log(`[processor] Found ${rows.length} pending rows`);

    for (const row of rows) {
      try {
        console.log(`[processor] Processing row ${row.id}: ${row.descr || '(no descr)'}`);

        const parsed = await extractEmailContent(row.text);
        const { html } = buildHtml(row, parsed);
        await updateFinalHtml(supabaseUrl, headers, row.id, html);

        console.log(`[processor] Row ${row.id} done`);
        results.processed++;
      } catch (err) {
        console.error(`[processor] Row ${row.id} failed: ${err.message}`);
        results.errors.push({ id: row.id, error: err.message });
        await markError(supabaseUrl, headers, row.id, err.message);
      }
    }
  } finally {
    isRunning = false;
  }

  return results;
}

module.exports = { processAll };
