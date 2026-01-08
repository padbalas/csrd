const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || '';

const SUPABASE_API_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
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

const getStripeCustomerId = async (token: string, companyId: string) => {
  const url = `${SUPABASE_URL}/rest/v1/subscriptions` +
    `?select=stripe_customer_id&company_id=eq.${companyId}` +
    `&stripe_customer_id=is.not.null&order=updated_at.desc&limit=1`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_API_KEY,
    },
  });
  return data?.[0]?.stripe_customer_id || null;
};

const createPortalSession = async (params: { customerId: string; returnUrl: string }) => {
  const body = new URLSearchParams();
  body.set('customer', params.customerId);
  body.set('return_url', params.returnUrl);
  return await fetchJson(`${STRIPE_API_BASE}/billing_portal/sessions`, {
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

  let payload: { return_url?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400, origin);
  }

  const returnUrl = payload.return_url || '';
  if (!returnUrl) {
    return jsonResponse({ error: 'Missing return URL' }, 400, origin);
  }

  try {
    const user = await getUser(token);
    const userId = user?.id;
    if (!userId) {
      return jsonResponse({ error: 'User profile unavailable' }, 400, origin);
    }
    const companyId = await getCompanyId(token, userId);
    if (!companyId) {
      return jsonResponse({ error: 'Company not found for user' }, 400, origin);
    }
    const stripeCustomerId = await getStripeCustomerId(token, companyId);
    if (!stripeCustomerId) {
      return jsonResponse({ error: 'No subscription found for company' }, 400, origin);
    }
    const session = await createPortalSession({ customerId: stripeCustomerId, returnUrl });
    return jsonResponse({ url: session.url }, 200, origin);
  } catch (err) {
    console.error('Portal session error', err);
    return jsonResponse({ error: 'Unable to create portal session' }, 500, origin);
  }
});
