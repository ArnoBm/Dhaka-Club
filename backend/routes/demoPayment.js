const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

const router = express.Router();

router.get('/checkout/:registrationId', async (req, res) => {
    const registration = await getRegistration(req.params.registrationId);

    if (!registration) {
        return res.status(404).send('Payment session not found.');
    }

    return res.send(renderCheckoutPage(registration));
});

router.post('/checkout/:registrationId/success', async (req, res) => {
    const registration = await getRegistration(req.params.registrationId);

    if (!registration) {
        return res.status(404).json({ message: 'Payment session not found.' });
    }

    await sequelize.query(
        `UPDATE event_registrations
         SET payment_status = 'Paid',
             payment_verified_at = NOW()
         WHERE id = :id`,
        {
            replacements: { id: req.params.registrationId },
            type: QueryTypes.UPDATE,
        }
    );

    return res.json({ message: 'Demo payment completed successfully.' });
});

router.get('/checkout/:registrationId/cancel', (req, res) => {
    return res.send('Demo payment cancelled. You can return to the Dhaka Club app and try again.');
});

async function getRegistration(registrationId) {
    const rows = await sequelize.query(
        `SELECT er.*, e.title AS event_title, e.event_date, e.venue, m.full_name, m.phone, m.email
         FROM event_registrations er
         INNER JOIN events e ON e.id = er.event_id
         INNER JOIN members m ON m.id = er.member_id
         WHERE er.id = :id
         LIMIT 1`,
        {
            replacements: { id: registrationId },
            type: QueryTypes.SELECT,
        }
    );

    return rows[0];
}

function renderCheckoutPage(registration) {
    const amount = Number(registration.total_amount || 0).toFixed(2);
    const successUrl = `/api/demo-payment/checkout/${registration.id}/success`;
    const cancelUrl = `/api/demo-payment/checkout/${registration.id}/cancel`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Demo Payment Gateway</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #eef2f7; color: #111827; }
    .topbar { background: #0f766e; color: #fff; padding: 16px 20px; font-size: 18px; font-weight: 700; }
    .wrap { max-width: 760px; margin: 24px auto; padding: 0 16px; }
    .grid { display: grid; gap: 16px; grid-template-columns: 1.2fr 0.8fr; }
    .card { background: #fff; border: 1px solid #dbe3ef; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 30px rgba(15,23,42,.08); }
    .head { background: #f8fafc; border-bottom: 1px solid #e5e7eb; padding: 14px 16px; font-weight: 700; }
    .body { padding: 16px; }
    .row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eef2f7; padding: 10px 0; font-size: 14px; }
    .row:last-child { border-bottom: 0; }
    .label { color: #64748b; }
    .value { font-weight: 700; text-align: right; }
    .amount { color: #0f766e; font-size: 30px; font-weight: 800; margin: 8px 0 0; }
    .method { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; }
    .dot { height: 14px; width: 14px; border-radius: 999px; background: #0f766e; box-shadow: inset 0 0 0 3px #fff; border: 2px solid #0f766e; }
    button { width: 100%; border: 0; border-radius: 8px; padding: 13px 16px; font-size: 15px; font-weight: 800; cursor: pointer; }
    .pay { background: #0f766e; color: #fff; margin-top: 12px; }
    .cancel { background: #f1f5f9; color: #334155; margin-top: 10px; }
    .notice { margin-top: 14px; border-radius: 8px; background: #fff7ed; color: #9a3412; padding: 12px; font-size: 13px; line-height: 1.45; }
    @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } .wrap { margin: 12px auto; } }
  </style>
</head>
<body>
  <div class="topbar">Demo Payment Gateway</div>
  <main class="wrap">
    <div class="grid">
      <section class="card">
        <div class="head">Payment Details</div>
        <div class="body">
          <div class="row"><span class="label">Merchant</span><span class="value">Dhaka Club Limited</span></div>
          <div class="row"><span class="label">Event</span><span class="value">${escapeHtml(registration.event_title)}</span></div>
          <div class="row"><span class="label">Customer</span><span class="value">${escapeHtml(registration.full_name)}</span></div>
          <div class="row"><span class="label">Invoice</span><span class="value">DC-EVT-${registration.id}</span></div>
          <div class="row"><span class="label">Status</span><span class="value">${escapeHtml(registration.payment_status)}</span></div>
          <p class="label">Payable Amount</p>
          <div class="amount">BDT ${amount}</div>
          <div class="notice">This is a demo checkout page for client presentation. No real money will be charged.</div>
        </div>
      </section>
      <section class="card">
        <div class="head">Select Payment Method</div>
        <div class="body">
          <div class="method"><span class="dot"></span><strong>Mobile Banking</strong></div>
          <div class="method"><span class="dot"></span><strong>Card Payment</strong></div>
          <div class="method"><span class="dot"></span><strong>Internet Banking</strong></div>
          <button class="pay" type="button" onclick="completePayment()">Confirm Purchase</button>
          <button class="cancel" type="button" onclick="location.href='${cancelUrl}'">Cancel Payment</button>
          <div class="notice" id="message" style="display:none"></div>
        </div>
      </section>
    </div>
  </main>
  <script>
    async function completePayment() {
      const button = document.querySelector('.pay');
      const message = document.getElementById('message');
      button.disabled = true;
      button.textContent = 'Processing...';
      const response = await fetch('${successUrl}', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      message.style.display = 'block';
      message.textContent = data.message || 'Payment completed. You can return to the app.';
      button.textContent = 'Entry Pass Ready';
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = router;
