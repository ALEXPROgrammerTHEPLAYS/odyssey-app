import { createClient } from '@supabase/supabase-js';
import { fetchPublicHttpsUrl } from '@/lib/opportunity-source-fetch';

const SOURCE_TYPES = new Set(['api', 'feed', 'csv']);

function validateResponse(sourceType, response, url) {
  const body = response.body.trim();
  if (!body) throw new Error('The source returned an empty response.');

  if (sourceType === 'api') {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error('The API response is not valid JSON.');
    }
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('The API response must be a JSON object or array.');
    }
    const records = Array.isArray(parsed)
      ? parsed.length
      : ['items', 'results', 'data'].map((key) => parsed[key]).find(Array.isArray)?.length;
    return records === undefined
      ? 'The endpoint returned valid JSON. Confirm its opportunity fields before enabling imports.'
      : `The endpoint returned valid JSON with ${records} record${records === 1 ? '' : 's'}.`;
  }

  if (sourceType === 'feed') {
    if (!/<(?:rss|feed|rdf:RDF)\b/i.test(body) || !/<\/(?:rss|feed|rdf:RDF)\s*>/i.test(body)) {
      throw new Error('The response does not look like an RSS, Atom, or RDF feed.');
    }
    return 'The endpoint returned a recognizable XML feed. No entries were imported.';
  }

  const firstLine = body.split(/\r?\n/, 1)[0];
  const contentTypeLooksCsv = /(?:text\/csv|application\/csv)/i.test(response.contentType);
  const extensionLooksCsv = url.pathname.toLowerCase().endsWith('.csv');
  if (!contentTypeLooksCsv && !extensionLooksCsv && !/[,\t;]/.test(firstLine)) {
    throw new Error('The response does not look like a CSV file.');
  }
  if (!/[,\t;]/.test(firstLine)) {
    throw new Error('The CSV response needs a delimited header row.');
  }
  return 'The endpoint returned a CSV-like document. No rows were imported.';
}

export async function POST(request) {
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (!accessToken) {
    return Response.json({ error: 'Authentication is required.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: 'Supabase authentication is not configured on the server.' }, { status: 503 });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || authData.user?.app_metadata?.role !== 'admin') {
    return Response.json({ error: 'Administrator access is required.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  if (!SOURCE_TYPES.has(body?.sourceType)) {
    return Response.json({ error: 'Only API, feed, and CSV sources can be tested.' }, { status: 400 });
  }

  try {
    const response = await fetchPublicHttpsUrl(body.url);
    const message = validateResponse(body.sourceType, response, response.url);
    return Response.json({ success: true, status: response.status, message });
  } catch (error) {
    return Response.json({ error: error.message || 'The source test failed.' }, { status: 400 });
  }
}
