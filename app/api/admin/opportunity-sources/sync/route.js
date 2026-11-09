import { createClient } from '@supabase/supabase-js';
import { fetchPublicHttpsUrl, parseRssFeed } from '@/lib/opportunity-source-fetch';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!UUID_PATTERN.test(body?.sourceId || '')) {
    return Response.json({ error: 'Choose a valid registered source.' }, { status: 400 });
  }

  const dataClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  try {
    const { data: source, error: sourceError } = await dataClient
      .from('opportunity_sources')
      .select('*')
      .eq('id', body.sourceId)
      .single();
    if (sourceError || !source) {
      throw new Error(sourceError?.message || 'The registered source could not be found.');
    }
    if (source.source_type !== 'feed') {
      throw new Error('Sync to review queue currently supports RSS and Atom feeds only.');
    }
    if (source.status === 'disabled') {
      throw new Error('Enable this source before syncing it.');
    }
    if (source.status !== 'verified') {
      throw new Error('Verify the official source and its usage terms before syncing it.');
    }
    if (source.last_test_result !== 'passed') {
      throw new Error('Run a successful Test sync before importing feed entries.');
    }

    const response = await fetchPublicHttpsUrl(source.url);
    const candidates = parseRssFeed(response.body, source.name);
    const { data: imported, error: importError } = await dataClient
      .from('opportunities')
      .upsert(candidates.map((candidate) => ({
        ...candidate,
        source_id: source.id,
      })), {
        onConflict: 'source_id,source_item_id',
        ignoreDuplicates: true,
      })
      .select('id');
    if (importError) throw importError;

    const syncedAt = new Date().toISOString();
    const { error: sourceUpdateError } = await dataClient
      .from('opportunity_sources')
      .update({ last_synced_at: syncedAt, updated_at: syncedAt })
      .eq('id', source.id);
    if (sourceUpdateError) throw sourceUpdateError;

    return Response.json({
      success: true,
      candidates: candidates.length,
      added: imported?.length || 0,
      message: `${imported?.length || 0} new item${imported?.length === 1 ? '' : 's'} added to the admin review queue. Existing feed items were skipped.`,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'The feed could not be imported.' }, { status: 400 });
  }
}
