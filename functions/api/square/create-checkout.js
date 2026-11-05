// Cloudflare Pages Function: POST /api/square/create-checkout
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { bookingDetails } = body;

    const squareEnv = env.SQUARE_ENVIRONMENT || 'sandbox';
    const isProd = squareEnv === 'production';
    const accessToken = isProd ? env.SQUARE_PROD_ACCESS_TOKEN : env.SQUARE_SANDBOX_ACCESS_TOKEN;
    const locationId = isProd ? env.SQUARE_PROD_LOCATION_ID : env.SQUARE_SANDBOX_LOCATION_ID;
    const baseUrl = isProd ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

    const depositAmount = Number(env.SQUARE_DEPOSIT_AMOUNT || 100);
    const currency = env.SQUARE_CURRENCY || 'USD';

    if (!accessToken || !locationId) {
      return new Response(JSON.stringify({ error: 'Square Access Token and Location ID not configured in Cloudflare environment.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const origin = url.origin;
    const tempOrderId = `BK-${Date.now()}`;
    const amountInCents = Math.round(depositAmount * 100);

    const squareRes = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Square-Version': '2024-05-15',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: {
          name: `${bookingDetails?.session?.title || 'Photography Session'} Deposit`,
          price_money: {
            amount: amountInCents,
            currency: currency
          },
          location_id: locationId
        },
        description: `Deposit payment for ${bookingDetails?.session?.title} on ${bookingDetails?.appointment?.date || ''}`,
        redirect_url: `${origin}/booking.html?payment=success&ref=${tempOrderId}`
      })
    });

    const squareData = await squareRes.json();
    if (!squareRes.ok || squareData.errors) {
      return new Response(JSON.stringify({
        error: squareData.errors ? squareData.errors.map(e => e.detail || e.message).join('; ') : 'Checkout link failed'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: squareData.payment_link.url,
      orderId: squareData.payment_link.order_id
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
