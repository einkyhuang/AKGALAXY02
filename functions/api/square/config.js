// Cloudflare Pages Function: GET /api/square/config
export async function onRequestGet(context) {
  const { env } = context;

  const squareEnv = env.SQUARE_ENVIRONMENT || 'sandbox';
  const isProd = squareEnv === 'production';

  const applicationId = isProd 
    ? (env.SQUARE_PROD_APP_ID || '')
    : (env.SQUARE_SANDBOX_APP_ID || '');

  const locationId = isProd
    ? (env.SQUARE_PROD_LOCATION_ID || '')
    : (env.SQUARE_SANDBOX_LOCATION_ID || '');

  const accessToken = isProd
    ? (env.SQUARE_PROD_ACCESS_TOKEN || '')
    : (env.SQUARE_SANDBOX_ACCESS_TOKEN || '');

  return new Response(JSON.stringify({
    success: true,
    environment: squareEnv,
    applicationId,
    locationId,
    depositAmount: Number(env.SQUARE_DEPOSIT_AMOUNT || 100),
    currency: env.SQUARE_CURRENCY || 'USD',
    isConfigured: Boolean(applicationId && accessToken && locationId)
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
