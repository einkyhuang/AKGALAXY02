// Cloudflare Pages Function: POST /api/square/process-payment
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { sourceId, bookingDetails } = body;

    if (!sourceId) {
      return jsonResp({ error: 'Payment token (sourceId) is required' }, 400);
    }
    if (!bookingDetails || !bookingDetails.customer || !bookingDetails.session) {
      return jsonResp({ error: 'Complete booking details are required' }, 400);
    }

    const squareEnv = env.SQUARE_ENVIRONMENT || 'sandbox';
    const isProd = squareEnv === 'production';
    const accessToken = isProd ? env.SQUARE_PROD_ACCESS_TOKEN : env.SQUARE_SANDBOX_ACCESS_TOKEN;
    const locationId = isProd ? env.SQUARE_PROD_LOCATION_ID : env.SQUARE_SANDBOX_LOCATION_ID;
    const baseUrl = isProd ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

    const depositAmount = Number(env.SQUARE_DEPOSIT_AMOUNT || 100);
    const currency = env.SQUARE_CURRENCY || 'USD';

    let paymentResult = null;
    const isMock = sourceId === 'mock_card_token' || !accessToken;

    if (!isMock) {
      const idempotencyKey = crypto.randomUUID();
      const amountInCents = Math.round(depositAmount * 100);
      const customerName = `${bookingDetails.customer.firstName || ''} ${bookingDetails.customer.lastName || ''}`.trim();
      const note = `Deposit: ${bookingDetails.session.title || 'Session'} (${customerName})`;

      const squareRes = await fetch(`${baseUrl}/v2/payments`, {
        method: 'POST',
        headers: {
          'Square-Version': '2024-05-15',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source_id: sourceId,
          idempotency_key: idempotencyKey,
          amount_money: {
            amount: amountInCents,
            currency: currency
          },
          autocomplete: true,
          location_id: locationId,
          reference_id: `BK-${Date.now()}`,
          note: note.substring(0, 500),
          buyer_email_address: bookingDetails.customer.email || undefined
        })
      });

      const squareData = await squareRes.json();
      if (!squareRes.ok || squareData.errors) {
        const errorDetail = squareData.errors ? squareData.errors.map(e => e.detail || e.message).join('; ') : 'Payment failed at Square';
        return jsonResp({ error: errorDetail, squareErrors: squareData.errors }, 400);
      }

      const p = squareData.payment;
      paymentResult = {
        paymentId: p.id,
        orderId: p.order_id || null,
        status: p.status,
        amount: depositAmount,
        currency: currency,
        receiptUrl: p.receipt_url || null,
        cardBrand: p.card_details?.card?.card_brand || 'CARD',
        last4: p.card_details?.card?.last_4 || '****',
        paidAt: p.created_at || new Date().toISOString()
      };
    } else {
      paymentResult = {
        paymentId: 'sq_demo_' + Date.now(),
        orderId: 'sq_ord_demo_' + Math.floor(1000 + Math.random() * 9000),
        status: 'COMPLETED',
        amount: depositAmount,
        currency: currency,
        receiptUrl: 'https://squareup.com/receipt/preview/demo',
        cardBrand: 'VISA (Demo)',
        last4: '1111',
        paidAt: new Date().toISOString(),
        isDemo: true
      };
    }

    const year = new Date().getFullYear();
    const confNumber = `NFS-${year}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newBooking = {
      id: `BK-${Date.now()}`,
      confirmationNumber: confNumber,
      createdAt: new Date().toISOString(),
      customer: bookingDetails.customer,
      session: {
        key: bookingDetails.session.key || 'custom',
        title: bookingDetails.session.title || 'Photography Session',
        totalPrice: bookingDetails.session.price || depositAmount,
        depositAmount: depositAmount,
        remainingBalance: Math.max(0, (bookingDetails.session.price || depositAmount) - depositAmount)
      },
      appointment: bookingDetails.appointment || {},
      payment: {
        method: 'square_web_payments_sdk',
        ...paymentResult
      },
      status: 'CONFIRMED',
      balanceStatus: 'UNPAID'
    };

    // If Cloudflare KV or D1 is bound, can persist here
    if (env.BOOKINGS_KV) {
      await env.BOOKINGS_KV.put(`booking:${newBooking.id}`, JSON.stringify(newBooking));
    }

    return jsonResp({
      success: true,
      booking: newBooking,
      paymentId: paymentResult.paymentId,
      receiptUrl: paymentResult.receiptUrl,
      confirmationNumber: confNumber,
      isDemo: Boolean(paymentResult.isDemo)
    }, 200);

  } catch (err) {
    return jsonResp({ error: err.message || 'Server error processing payment.' }, 500);
  }
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
