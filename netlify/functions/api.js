const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABLE = 'publications';
const BUCKET = 'publication-pdfs';

function response(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }, extraHeaders || {}),
    body: JSON.stringify(body)
  };
}

function requireConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase environment variables are not configured');
}

async function supabaseRequest(path, options) {
  requireConfig();
  const headers = Object.assign({ apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }, options && options.headers ? options.headers : {});
  const result = await fetch(`${SUPABASE_URL}${path}`, Object.assign({}, options, { headers }));
  if (!result.ok) throw new Error(`Supabase request failed (${result.status}): ${await result.text()}`);
  return result.status === 204 ? null : result.json();
}

async function requireAdmin(event) {
  const authorization = event.headers && (event.headers.authorization || event.headers.Authorization);
  if (!authorization || !authorization.startsWith('Bearer ')) return false;
  const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: authorization } });
  return result.ok;
}

function requestResource(event) {
  const pathname = new URL(event.rawUrl || 'https://jpl.invalid').pathname;
  const parts = pathname.split('/').filter(Boolean);
  const apiIndex = parts.indexOf('api');
  return { type: parts[apiIndex + 1] || '', id: parts[apiIndex + 2] || '' };
}

function mapPublication(row) {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors,
    category: row.category,
    date: row.date,
    link: row.link,
    description: row.description,
    hasPdf: row.has_pdf,
    pdfName: row.pdf_name,
    pdfUrl: row.has_pdf ? `/api/pdfs/${encodeURIComponent(row.id)}` : ''
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});

  try {
    const resource = requestResource(event);

    if (resource.type === 'publications' && event.httpMethod === 'GET') {
      const rows = await supabaseRequest(`/rest/v1/${TABLE}?select=*&order=date.desc,created_at.desc`);
      return response(200, { success: true, data: rows.map(mapPublication) });
    }

    if (resource.type === 'pdfs' && (event.httpMethod === 'GET' || event.httpMethod === 'HEAD') && resource.id) {
      const pdfResult = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(resource.id)}.pdf`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
      if (!pdfResult.ok) return response(404, { success: false, message: 'PDF document not found' });
      if (event.httpMethod === 'HEAD') return { statusCode: 200, headers: { 'Content-Type': 'application/pdf' }, body: '' };
      return { statusCode: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline' }, isBase64Encoded: true, body: Buffer.from(await pdfResult.arrayBuffer()).toString('base64') };
    }

    if (resource.type === 'publications' && (event.httpMethod === 'POST' || event.httpMethod === 'DELETE') && !(await requireAdmin(event))) {
      return response(401, { success: false, message: 'Admin authentication required' });
    }

    if (resource.type === 'publications' && event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const id = payload.id || `pub-${Date.now()}`;
      let hasPdf = Boolean(payload.hasPdf);
      let pdfName = payload.pdfName || '';

      if (payload.pdfDataUrl) {
        const match = payload.pdfDataUrl.match(/^data:application\/pdf;base64,(.+)$/);
        if (!match) return response(400, { success: false, message: 'Invalid PDF data' });
        const pdfResult = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}.pdf`, {
          method: 'POST',
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
          body: Buffer.from(match[1], 'base64')
        });
        if (!pdfResult.ok) throw new Error(`PDF upload failed (${pdfResult.status})`);
        hasPdf = true;
        pdfName = payload.pdfName || 'publication.pdf';
      } else if (payload.removePdf) {
        await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}.pdf`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
        hasPdf = false;
        pdfName = '';
      }

      const rows = await supabaseRequest(`/rest/v1/${TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id, title: payload.title || '', authors: payload.authors || '', category: payload.category || 'Journal', date: payload.date || new Date().toISOString().split('T')[0], link: payload.link || '', description: payload.description || '', has_pdf: hasPdf, pdf_name: pdfName })
      });
      return response(200, { success: true, entry: mapPublication(rows[0]) });
    }

    if (resource.type === 'publications' && resource.id && event.httpMethod === 'DELETE') {
      await supabaseRequest(`/rest/v1/${TABLE}?id=eq.${encodeURIComponent(resource.id)}`, { method: 'DELETE' });
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(resource.id)}.pdf`, { method: 'DELETE', headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
      return response(200, { success: true });
    }

    return response(404, { success: false, message: 'API route not found' });
  } catch (error) {
    console.error(error);
    return response(500, { success: false, message: 'Supabase request failed' });
  }
};
