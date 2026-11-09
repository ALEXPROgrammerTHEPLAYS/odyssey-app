import { createClient } from '@supabase/supabase-js';

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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: 'Account management is not configured on the server.' }, { status: 503 });
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

  if (body?.action === 'list') {
    const userIds = Array.isArray(body.userIds) ? body.userIds : [];
    if (userIds.length > 100 || userIds.some((id) => !UUID_PATTERN.test(id))) {
      return Response.json({ error: 'The account list is invalid.' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const users = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return Response.json({ error: error.message }, { status: 400 });
      users.push(...data.users);
      if (data.users.length < 100 || userIds.every((id) => users.some((account) => account.id === id))) break;
    }

    const requestedIds = new Set(userIds);
    const suspendedIds = users
      .filter((account) => requestedIds.has(account.id) && account.banned_until && new Date(account.banned_until) > new Date())
      .map((account) => account.id);
    return Response.json({ suspendedIds });
  }

  if (!UUID_PATTERN.test(body?.userId || '') || !['suspend', 'restore'].includes(body?.action)) {
    return Response.json({ error: 'Choose a valid account and action.' }, { status: 400 });
  }
  if (body.userId === authData.user.id) {
    return Response.json({ error: 'You cannot suspend your own administrator account.' }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(body.userId);
  if (targetError) {
    return Response.json({ error: targetError.message }, { status: 400 });
  }
  if (body.action === 'suspend' && targetData.user?.app_metadata?.role === 'admin') {
    return Response.json({ error: 'Administrator accounts cannot be suspended here.' }, { status: 403 });
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(body.userId, {
    ban_duration: body.action === 'suspend' ? '876000h' : 'none',
  });

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 400 });
  }

  return Response.json({ success: true, action: body.action });
}
