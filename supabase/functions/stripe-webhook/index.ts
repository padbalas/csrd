const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || '';

const PRICE_CORE_IDS = (Deno.env.get('PRICE_CORE_IDS') || '').split(',').map((id) => id.trim()).filter(Boolean);
const PRICE_COMPLETE_IDS = (Deno.env.get('PRICE_COMPLETE_IDS') || '').split(',').map((id) => id.trim()).filter(Boolean);

const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

const paidStatuses = new Set(['active', 'trialing']);

type Tier = 'free' | 'core' | 'complete';

type SubscriptionRow = {
  company_id: string;
  user_id: string;
};

const pickTierFromPrice = (priceId?: string | null): Tier => {
  if (priceId && PRICE_CORE_IDS.includes(priceId)) return 'core';
  if (priceId && PRICE_COMPLETE_IDS.includes(priceId)) return 'complete';
  return 'free';
};

const getTierFromMetadata = (metadata?: Record<string, string> | null): Tier => {
  const tier = (metadata?.tier || '').toLowerCase();
  if (tier === 'core' || tier === 'complete') return tier;
  return 'free';
};

const getPriceIdFromSubscription = (subscription: any): string | null => {
  const item = subscription?.items?.data?.[0];
  return item?.price?.id || null;
};

const resolveCompanyAndUser = async (params: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  metadata?: Record<string, string> | null;
}): Promise<SubscriptionRow | null> => {
  const { stripeCustomerId, stripeSubscriptionId, metadata } = params;
  const companyId = metadata?.company_id;
  const userId = metadata?.user_id;
  if (companyId && userId) return { company_id: companyId, user_id: userId };

  if (stripeSubscriptionId) {
    const url = `${SUPABASE_REST_URL}/subscriptions` +
      `?select=company_id,user_id&stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}&limit=1`;
    const resp = await fetch(url, { headers: SUPABASE_HEADERS });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.[0]?.company_id && data?.[0]?.user_id) return data[0];
    }
  }

  if (stripeCustomerId) {
    const url = `${SUPABASE_REST_URL}/subscriptions` +
      `?select=company_id,user_id&stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&limit=1`;
    const resp = await fetch(url, { headers: SUPABASE_HEADERS });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.[0]?.company_id && data?.[0]?.user_id) return data[0];
    }
  }

  return null;
};

const buildEntitlements = (tier: Tier) => {
  if (tier === 'complete') {
    return {
      tier,
      max_scope1_records: null,
      max_scope2_records: null,
      allow_scope3: true,
      allow_exports: true,
      allow_insights: true,
      max_sites: null,
    };
  }

  if (tier === 'core') {
    return {
      tier,
      max_scope1_records: null,
      max_scope2_records: null,
      allow_scope3: false,
      allow_exports: true,
      allow_insights: true,
      max_sites: 1,
    };
  }

  return {
    tier: 'free',
    max_scope1_records: 5,
    max_scope2_records: 5,
    allow_scope3: false,
    allow_exports: true,
    allow_insights: true,
    max_sites: 1,
  };
};

const upsertSubscription = async (params: {
  company_id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: string;
  tier: Tier;
  current_period_end?: number | null;
}) => {
  const currentPeriodEnd = params.current_period_end
    ? new Date(params.current_period_end * 1000).toISOString()
    : null;

  const url = `${SUPABASE_REST_URL}/subscriptions?on_conflict=stripe_subscription_id`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify([{
      company_id: params.company_id,
      user_id: params.user_id,
      stripe_customer_id: params.stripe_customer_id,
      stripe_subscription_id: params.stripe_subscription_id,
      status: params.status,
      tier: params.tier,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }]),
  });
  if (!resp.ok) {
    throw new Error(`Supabase subscriptions upsert failed: ${resp.status}`);
  }
};

const upsertEntitlements = async (companyId: string, tier: Tier) => {
  const entitlements = buildEntitlements(tier);
  const url = `${SUPABASE_REST_URL}/entitlements?on_conflict=company_id`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify([{
      company_id: companyId,
      ...entitlements,
      updated_at: new Date().toISOString(),
    }]),
  });
  if (!resp.ok) {
    throw new Error(`Supabase entitlements upsert failed: ${resp.status}`);
  }
};

const processSubscription = async (subscription: any) => {
  const stripeCustomerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;
  const stripeSubscriptionId = subscription.id;
  const metadata = subscription.metadata || null;
  const resolved = await resolveCompanyAndUser({
    stripeCustomerId,
    stripeSubscriptionId,
    metadata,
  });
  if (!resolved) {
    console.warn('No company/user mapping for subscription', stripeSubscriptionId);
    return;
  }

  const priceId = getPriceIdFromSubscription(subscription);
  const tierFromPrice = pickTierFromPrice(priceId);
  const tierFromMetadata = getTierFromMetadata(metadata);
  const tier = tierFromPrice !== 'free' ? tierFromPrice : tierFromMetadata;

  await upsertSubscription({
    company_id: resolved.company_id,
    user_id: resolved.user_id,
    stripe_customer_id: stripeCustomerId || '',
    stripe_subscription_id: stripeSubscriptionId,
    status: subscription.status || 'unknown',
    tier,
    current_period_end: subscription.current_period_end,
  });

  const effectiveTier: Tier = paidStatuses.has(subscription.status) ? tier : 'free';
  await upsertEntitlements(resolved.company_id, effectiveTier);
};

const fetchStripeSubscription = async (subscriptionId: string) => {
  const resp = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Stripe API error: ${resp.status}`);
  }
  return await resp.json();
};

const processCheckoutSession = async (session: any) => {
  if (!session?.subscription) return;
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription.id;
  const subscription = await fetchStripeSubscription(subscriptionId);
  await processSubscription(subscription);
};

const parseSignatureHeader = (header: string) => {
  const parts = header.split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatureParts = parts.filter((part) => part.startsWith('v1='));
  if (!timestampPart || !signatureParts.length) return null;
  return {
    timestamp: timestampPart.replace('t=', ''),
    signatures: signatureParts.map((part) => part.replace('v1=', '')),
  };
};

const verifyStripeSignature = async (rawBody: string, sigHeader: string, secret: string) => {
  const parsed = parseSignatureHeader(sigHeader);
  if (!parsed) return false;
  const timestamp = parsed.timestamp;
  const payload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const expectedLower = expected.toLowerCase();
  return parsed.signatures.some((sig) => sig.toLowerCase() === expectedLower);
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing required environment variables');
    return new Response('Server misconfigured', { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await req.text();
  const valid = await verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error('Webhook signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody);
    switch (event.type) {
      case 'checkout.session.completed':
        await processCheckoutSession(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await processSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook processing error', err);
  }

  return new Response('ok', { status: 200 });
});
