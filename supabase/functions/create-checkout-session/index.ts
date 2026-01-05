const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || '';
const PRICE_CORE_IDS = (Deno.env.get('PRICE_CORE_IDS') || '').split(',').map((id) => id.trim()).filter(Boolean);
const PRICE_COMPLETE_IDS = (Deno.env.get('PRICE_COMPLETE_IDS') || '').split(',').map((id) => id.trim()).filter(Boolean);

const SUPABASE_API_KEY = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const jsonResponse = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });

const fetchJson = async (url: string, options: RequestInit) => {
  const resp = await fetch(url, options);
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    const message = data?.error?.message || `Request failed: ${resp.status}`;
    throw new Error(message);
  }
  return data;
};

const getUser = async (token: string) => {
  const url = `${SUPABASE_URL}/auth/v1/user`;
  return await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_API_KEY,
    },
  });
};

const getCompanyId = async (token: string, userId: string) => {
  const url = `${SUPABASE_URL}/rest/v1/companies?select=id&user_id=eq.${userId}&order=created_at.asc&limit=1`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_API_KEY,
    },
  });
  return data?.[0]?.id || null;
};

const getPriceId = (tier: string) => {
  if (tier === 'core') return PRICE_CORE_IDS[0] || '';
  if (tier === 'complete') return PRICE_COMPLETE_IDS[0] || '';
  return '';
};

const createCheckoutSession = async (params: {
  userId: string;
  email: string;
  companyId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) => {
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('success_url', params.successUrl);
  body.set('cancel_url', params.cancelUrl);
  body.set('client_reference_id', params.userId);
  body.set('customer_email', params.email);
  body.set('line_items[0][price]', params.priceId);
  body.set('line_items[0][quantity]', '1');
  body.set('metadata[company_id]', params.companyId);
  body.set('metadata[user_id]', params.userId);
  body.set('subscription_data[metadata][company_id]', params.companyId);
  body.set('subscription_data[metadata][user_id]', params.userId);

  return await fetchJson(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(origin) });
  }

  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_API_KEY) {
    return jsonResponse({ error: 'Server misconfigured' }, 500, origin);
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return jsonResponse({ error: 'Missing auth token' }, 401, origin);
  }

  let payload: { tier?: string; success_url?: string; cancel_url?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400, origin);
  }

  const tier = (payload.tier || '').toLowerCase();
  const successUrl = payload.success_url || '';
  const cancelUrl = payload.cancel_url || '';
  const priceId = getPriceId(tier);

  if (!tier || !priceId) {
    return jsonResponse({ error: 'Invalid tier or price configuration' }, 400, origin);
  }
  if (!successUrl || !cancelUrl) {
    return jsonResponse({ error: 'Missing success or cancel URL' }, 400, origin);
  }

  try {
    const user = await getUser(token);
    const userId = user?.id;
    const email = user?.email;
    if (!userId || !email) {
      return jsonResponse({ error: 'User profile unavailable' }, 400, origin);
    }
    const companyId = await getCompanyId(token, userId);
    if (!companyId) {
      return jsonResponse({ error: 'Company not found for user' }, 400, origin);
    }

    const session = await createCheckoutSession({
      userId,
      email,
      companyId,
      priceId,
      successUrl,
      cancelUrl,
    });

    return jsonResponse({ url: session.url }, 200, origin);
  } catch (err) {
    console.error('Checkout session error', err);
    return jsonResponse({ error: 'Unable to create checkout session' }, 500, origin);
  }
});
