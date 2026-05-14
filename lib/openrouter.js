'use strict';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-2.5-flash';

const PROMPT_TEMPLATE = `Extract email content from the provided brief.

INPUT:
{TEXT}

Return JSON only.

Rules:
- subject: text after "Subject:"
- preheader: text after "Preheader:"
- body_paragraphs: text after "Body:" and before "CTA:", split into clean readable paragraphs.
- Remove the greeting line from body_paragraphs if present.
- Remove any line that starts with "CTA:" from body_paragraphs.
- cta: text after "CTA:"
- Do not include markdown.
- Do not generate HTML.`;

async function extractEmailContent(text) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY env var is not set');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: PROMPT_TEMPLATE.replace('{TEXT}', text) }],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenRouter');

  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

module.exports = { extractEmailContent };
