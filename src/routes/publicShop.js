const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// GET /shop/:slug — PUBLIC, server-rendered. This is the actual page a
// customer's phone lands on when it scans the "Share your shop" QR code.
// It's intentionally plain HTML + vanilla JS (no build step) so it works
// the moment this backend is deployed, with zero extra hosting.
router.get('/:slug', async (req, res) => {
  const business = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!business) {
    return res.status(404).send('<h1>Store not found</h1><p>This shop link is no longer valid.</p>');
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, inShop: true },
    orderBy: { name: 'asc' },
  });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(business.name)} — Shop</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#F1F4F6;color:#14181C;}
  header{background:#14181C;color:#fff;padding:20px 16px;text-align:center;}
  header h1{margin:0;font-size:20px;}
  main{max-width:480px;margin:0 auto;padding:16px;}
  .product{background:#fff;border-radius:10px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;}
  .product h3{margin:0 0 4px;font-size:15px;}
  .product p{margin:0;color:#5B6672;font-size:13px;}
  .price{font-weight:700;color:#B8571A;}
  .cta{display:block;width:100%;background:#E0762A;color:#fff;border:none;border-radius:22px;padding:14px;font-size:15px;font-weight:700;margin:16px 0;cursor:pointer;}
  #authBox{background:#fff;border-radius:10px;padding:16px;margin-top:16px;display:none;}
  #authBox input{width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #D6DEE3;border-radius:6px;}
  #authBox button{width:100%;padding:10px;background:#14181C;color:#fff;border:none;border-radius:6px;cursor:pointer;}
  #status{font-size:13px;color:#1F8A5A;margin-top:8px;text-align:center;}
</style>
</head>
<body>
<header><h1>${escapeHtml(business.name)}</h1></header>
<main>
  ${products.length === 0 ? '<p>No products available yet.</p>' : products.map((p) => `
    <div class="product">
      <div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.category || '')}</p></div>
      <div class="price">${Number(p.price).toFixed(2)} ${escapeHtml(business.currency)}</div>
    </div>
  `).join('')}

  <button class="cta" id="signupToggle">Sign up to order from this shop</button>

  <div id="authBox">
    <input id="fullName" placeholder="Full name">
    <input id="email" placeholder="Email" type="email">
    <input id="phone" placeholder="Phone (optional)">
    <input id="password" placeholder="Password (min 8 characters)" type="password">
    <button id="submitSignup">Create account</button>
    <p id="status"></p>
  </div>
</main>
<script>
  const slug = ${JSON.stringify(business.slug)};
  document.getElementById('signupToggle').addEventListener('click', () => {
    document.getElementById('authBox').style.display = 'block';
  });
  document.getElementById('submitSignup').addEventListener('click', async () => {
    const body = {
      slug,
      fullName: document.getElementById('fullName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      password: document.getElementById('password').value,
    };
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Creating account...';
    try {
      const res = await fetch('/api/customers/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { statusEl.style.color = '#B23A2E'; statusEl.textContent = data.error || 'Signup failed'; return; }
      localStorage.setItem('shop_customer_token_' + slug, data.token);
      statusEl.style.color = '#1F8A5A';
      statusEl.textContent = 'Account created! You are signed in as ' + data.customer.fullName + '.';
    } catch (e) {
      statusEl.style.color = '#B23A2E';
      statusEl.textContent = 'Network error — please try again.';
    }
  });
</script>
</body>
</html>`);
});

module.exports = router;
