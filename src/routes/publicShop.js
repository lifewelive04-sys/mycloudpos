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
// Plain HTML + vanilla JS (no build step), but now a full storefront:
// search, categories, cart, sign up/sign in, and real checkout — wired
// straight into the existing /api/shop and /api/customers routes.
router.get('/:slug', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, slug: true, name: true, logoUrl: true, currency: true },
  });
  if (!business) {
    return res.status(404).send('<h1>Store not found</h1><p>This shop link is no longer valid.</p>');
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, inShop: true },
    orderBy: { name: 'asc' },
  });

  const currency = escapeHtml(business.currency || '');
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const initial = business.name.trim().charAt(0).toUpperCase() || 'S';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(business.name)} — Shop</title>
<style>
  :root{ --ink:#14181C; --ink-soft:#5B6672; --line:#D6DEE3; --paper:#F1F4F6; --brand:#E0762A; --brand-dark:#B8571A; --ok:#1F8A5A; --err:#B23A2E; }
  *{box-sizing:border-box;}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:var(--paper);color:var(--ink);}
  header{background:var(--ink);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:5;}
  .avatar{width:34px;height:34px;border-radius:8px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;overflow:hidden;}
  .avatar img{width:100%;height:100%;object-fit:cover;}
  header h1{margin:0;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #accountBtn{background:none;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer;}
  #cartBtn{background:none;border:none;color:#fff;cursor:pointer;position:relative;padding:6px;font-size:20px;line-height:1;}
  #cartCount{position:absolute;top:0;right:0;background:var(--brand);color:#fff;font-size:10px;font-weight:700;border-radius:999px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 3px;}
  .searchWrap{padding:12px 16px 0;max-width:520px;margin:0 auto;}
  #search{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;}
  .chips{display:flex;gap:8px;overflow-x:auto;padding:10px 16px;max-width:520px;margin:0 auto;-webkit-overflow-scrolling:touch;}
  .chip{flex-shrink:0;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--ink);}
  .chip.active{background:var(--ink);color:#fff;border-color:var(--ink);}
  main{max-width:520px;margin:0 auto;padding:4px 16px 90px;}
  .product{background:#fff;border-radius:12px;padding:12px;margin-bottom:10px;display:flex;gap:12px;align-items:center;}
  .thumb{width:52px;height:52px;border-radius:8px;background:var(--paper);flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--ink-soft);font-size:11px;}
  .thumb img{width:100%;height:100%;object-fit:cover;}
  .pinfo{flex:1;min-width:0;}
  .pinfo h3{margin:0 0 2px;font-size:14px;}
  .pinfo p{margin:0;color:var(--ink-soft);font-size:12px;}
  .price{font-weight:700;color:var(--brand-dark);font-size:13px;white-space:nowrap;}
  .stock-low{color:var(--err);font-size:11px;}
  .addBtn{background:var(--brand);color:#fff;border:none;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;}
  .addBtn:disabled{background:#C7CDD3;cursor:not-allowed;}
  .qtyStep{display:flex;align-items:center;gap:6px;flex-shrink:0;}
  .qtyStep button{width:26px;height:26px;border-radius:6px;border:1px solid var(--line);background:#fff;font-size:14px;cursor:pointer;}
  .empty{text-align:center;color:var(--ink-soft);padding:40px 0;font-size:14px;}

  #cartBar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:12px 16px;display:none;justify-content:space-between;align-items:center;max-width:520px;margin:0 auto;box-shadow:0 -4px 14px rgba(0,0,0,.06);}
  #cartBar button{background:var(--brand);color:#fff;border:none;border-radius:20px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;}

  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;align-items:flex-end;justify-content:center;z-index:20;}
  .overlay.open{display:flex;}
  .sheet{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;padding:18px 16px 24px;}
  .sheet h2{margin:0 0 14px;font-size:17px;}
  .sheet-close{float:right;background:none;border:none;font-size:18px;cursor:pointer;color:var(--ink-soft);}
  .cartRow{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--paper);gap:10px;}
  .cartRow .name{font-size:13px;flex:1;min-width:0;}
  .cartRow .linePrice{font-size:13px;font-weight:700;white-space:nowrap;}
  .subtotalRow{display:flex;justify-content:space-between;font-weight:700;padding:14px 0 6px;font-size:15px;}
  .fullBtn{width:100%;background:var(--brand);color:#fff;border:none;border-radius:22px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;margin-top:10px;}
  .fullBtn:disabled{background:#C7CDD3;cursor:not-allowed;}
  .ghostBtn{width:100%;background:none;border:1px solid var(--line);border-radius:22px;padding:11px;font-size:13px;cursor:pointer;margin-top:8px;color:var(--ink);}

  .tabs{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:14px;}
  .tabs button{flex:1;background:#fff;border:none;padding:10px;font-size:13px;cursor:pointer;color:var(--ink-soft);}
  .tabs button.active{background:var(--ink);color:#fff;}
  .field{margin-bottom:10px;}
  .field label{display:block;font-size:12px;color:var(--ink-soft);margin-bottom:4px;}
  .field input, .field textarea{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:14px;}
  #statusMsg{font-size:13px;margin-top:8px;text-align:center;min-height:16px;}
  #statusMsg.err{color:var(--err);}
  #statusMsg.ok{color:var(--ok);}

  .receipt-head{text-align:center;margin-bottom:12px;}
  .receipt-head .tick{width:44px;height:44px;border-radius:50%;background:#E6F4EC;color:var(--ok);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px;}
  .receipt-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);padding:4px 0;}
</style>
</head>
<body>
<header>
  <div class="avatar" id="bizAvatar">${business.logoUrl ? `<img src="${escapeHtml(business.logoUrl)}" alt="">` : escapeHtml(initial)}</div>
  <h1>${escapeHtml(business.name)}</h1>
  <button id="accountBtn">Sign in</button>
  <button id="cartBtn">🛒<span id="cartCount" style="display:none;">0</span></button>
</header>

<div class="searchWrap"><input id="search" placeholder="Search ${escapeHtml(business.name)}"></div>
<div class="chips" id="chips">
  <button class="chip active" data-cat="">All</button>
  ${categories.map((c) => `<button class="chip" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
</div>

<main id="grid">
  ${products.length === 0 ? '<div class="empty">No products available yet — check back soon.</div>' : ''}
</main>

<div id="cartBar"><span id="cartSummary"></span><button id="openCartBtn">View cart</button></div>

<!-- Cart sheet -->
<div class="overlay" id="cartOverlay">
  <div class="sheet">
    <button class="sheet-close" data-close="cartOverlay">✕</button>
    <h2>Your cart</h2>
    <div id="cartItems"></div>
    <div class="subtotalRow"><span>Subtotal</span><span id="cartSubtotal">${escapeHtml(currency)} 0.00</span></div>
    <button class="fullBtn" id="checkoutBtn" disabled>Checkout</button>
  </div>
</div>

<!-- Auth sheet -->
<div class="overlay" id="authOverlay">
  <div class="sheet">
    <button class="sheet-close" data-close="authOverlay">✕</button>
    <h2>Sign in to order</h2>
    <div class="tabs">
      <button id="tabSignup" class="active">New customer</button>
      <button id="tabLogin">Returning</button>
    </div>
    <div id="signupFields">
      <div class="field"><label>Full name</label><input id="su_name"></div>
      <div class="field"><label>Email</label><input id="su_email" type="email"></div>
      <div class="field"><label>Phone (optional)</label><input id="su_phone"></div>
      <div class="field"><label>Password (min 8 characters)</label><input id="su_pass" type="password"></div>
      <button class="fullBtn" id="doSignup">Create account</button>
    </div>
    <div id="loginFields" style="display:none;">
      <div class="field"><label>Email</label><input id="li_email" type="email"></div>
      <div class="field"><label>Password</label><input id="li_pass" type="password"></div>
      <button class="fullBtn" id="doLogin">Sign in</button>
    </div>
    <p id="statusMsg"></p>
  </div>
</div>

<!-- Fulfillment / place order sheet -->
<div class="overlay" id="fulfillOverlay">
  <div class="sheet">
    <button class="sheet-close" data-close="fulfillOverlay">✕</button>
    <h2>Delivery details</h2>
    <div class="field">
      <label>Delivery address, or write "Pickup"</label>
      <textarea id="fulfillText" rows="3" placeholder="e.g. 12 Ring Road, Accra — or Pickup"></textarea>
    </div>
    <button class="fullBtn" id="placeOrderBtn">Place order</button>
    <p id="fulfillMsg" style="font-size:13px;margin-top:8px;text-align:center;"></p>
  </div>
</div>

<!-- Order confirmation sheet -->
<div class="overlay" id="confirmOverlay">
  <div class="sheet">
    <button class="sheet-close" data-close="confirmOverlay">✕</button>
    <div class="receipt-head">
      <div class="tick">✓</div>
      <h2 style="margin:0;">Order placed</h2>
      <p style="margin:4px 0 0;color:var(--ink-soft);font-size:13px;">The store has been notified</p>
    </div>
    <div id="confirmBody"></div>
    <button class="fullBtn" data-close="confirmOverlay">Continue shopping</button>
  </div>
</div>

<script>
(function(){
  const SLUG = ${JSON.stringify(business.slug)};
  const CURRENCY = ${JSON.stringify(business.currency || '')};
  const PRODUCTS = ${JSON.stringify(products.map((p) => ({
    id: p.id, name: p.name, category: p.category || '', price: Number(p.price),
    stock: p.stock, image: p.image || null,
  })))};
  const TOKEN_KEY = 'shop_customer_token_' + SLUG;

  const state = { search: '', category: '', cart: {}, customer: null };
  const money = (n) => CURRENCY + ' ' + Number(n || 0).toFixed(2);
  const $ = (id) => document.getElementById(id);

  function openSheet(id){ $(id).classList.add('open'); }
  function closeSheet(id){ $(id).classList.remove('open'); }
  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.addEventListener('click', ()=> closeSheet(btn.getAttribute('data-close')));
  });

  // ---- Product grid ----
  function renderGrid(){
    const grid = $('grid');
    const term = state.search.trim().toLowerCase();
    const filtered = PRODUCTS.filter(p =>
      (!state.category || p.category === state.category) &&
      (!term || p.name.toLowerCase().includes(term))
    );
    if(!filtered.length){
      grid.innerHTML = '<div class="empty">No products match your search.</div>';
      return;
    }
    grid.innerHTML = filtered.map(p => {
      const qty = state.cart[p.id] ? state.cart[p.id].qty : 0;
      const out = p.stock <= 0;
      const controls = qty > 0
        ? '<div class="qtyStep"><button data-dec="'+p.id+'">\u2212</button><span>'+qty+'</span><button data-inc="'+p.id+'" '+(qty>=p.stock?'disabled':'')+'>+</button></div>'
        : '<button class="addBtn" data-add="'+p.id+'" '+(out?'disabled':'')+'>'+(out?'Out of stock':'Add')+'</button>';
      return '<div class="product">'
        + '<div class="thumb">'+(p.image ? '<img src="'+p.image+'" alt="">' : '\uD83D\uDCE6')+'</div>'
        + '<div class="pinfo"><h3>'+escapeText(p.name)+'</h3><p>'+escapeText(p.category||'')+'</p>'
        + (p.stock > 0 && p.stock <= 5 ? '<p class="stock-low">Only '+p.stock+' left</p>' : '') + '</div>'
        + '<div style="text-align:right;"><div class="price">'+money(p.price)+'</div><div style="margin-top:6px;">'+controls+'</div></div>'
        + '</div>';
    }).join('');
  }
  function escapeText(s){
    const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML;
  }

  $('grid').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    if(add) setQty(add.getAttribute('data-add'), 1);
    if(inc) setQty(inc.getAttribute('data-inc'), (state.cart[inc.getAttribute('data-inc')]?.qty || 0) + 1);
    if(dec) setQty(dec.getAttribute('data-dec'), (state.cart[dec.getAttribute('data-dec')]?.qty || 0) - 1);
  });

  function setQty(productId, qty){
    const product = PRODUCTS.find(p => p.id === productId);
    if(!product) return;
    qty = Math.max(0, Math.min(qty, product.stock));
    if(qty === 0) delete state.cart[productId];
    else state.cart[productId] = { product, qty };
    renderGrid();
    renderCartBar();
    renderCartSheet();
  }

  function cartEntries(){ return Object.values(state.cart); }
  function cartTotal(){ return cartEntries().reduce((s,e)=> s + e.product.price * e.qty, 0); }
  function cartCount(){ return cartEntries().reduce((s,e)=> s + e.qty, 0); }

  function renderCartBar(){
    const bar = $('cartBar'), count = cartCount();
    if(count === 0){ bar.style.display = 'none'; $('cartCount').style.display = 'none'; return; }
    bar.style.display = 'flex';
    $('cartSummary').textContent = count + ' item(s) — ' + money(cartTotal());
    $('cartCount').style.display = 'flex';
    $('cartCount').textContent = count;
  }
  function renderCartSheet(){
    const box = $('cartItems');
    const entries = cartEntries();
    box.innerHTML = entries.length ? entries.map(e =>
      '<div class="cartRow"><span class="name">'+escapeText(e.product.name)+' × '+e.qty+'</span>'
      + '<span class="linePrice">'+money(e.product.price*e.qty)+'</span></div>'
    ).join('') : '<p style="color:var(--ink-soft);font-size:13px;">Your cart is empty.</p>';
    $('cartSubtotal').textContent = money(cartTotal());
    $('checkoutBtn').disabled = entries.length === 0;
  }

  $('search').addEventListener('input', e => { state.search = e.target.value; renderGrid(); });
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.category = chip.getAttribute('data-cat');
      renderGrid();
    });
  });
  $('cartBtn').addEventListener('click', () => openSheet('cartOverlay'));
  $('openCartBtn').addEventListener('click', () => openSheet('cartOverlay'));

  // ---- Auth ----
  $('tabSignup').addEventListener('click', () => {
    $('tabSignup').classList.add('active'); $('tabLogin').classList.remove('active');
    $('signupFields').style.display = 'block'; $('loginFields').style.display = 'none';
  });
  $('tabLogin').addEventListener('click', () => {
    $('tabLogin').classList.add('active'); $('tabSignup').classList.remove('active');
    $('loginFields').style.display = 'block'; $('signupFields').style.display = 'none';
  });

  function setStatus(msg, kind){
    const el = $('statusMsg'); el.textContent = msg || ''; el.className = kind ? kind : '';
  }

  async function afterAuth(data){
    localStorage.setItem(TOKEN_KEY, data.token);
    state.customer = data.customer;
    $('accountBtn').textContent = data.customer.fullName.split(' ')[0];
    closeSheet('authOverlay');
    if(cartCount() > 0) openSheet('fulfillOverlay');
  }

  $('doSignup').addEventListener('click', async () => {
    setStatus('Creating account…');
    try{
      const res = await fetch('/api/customers/signup', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ slug: SLUG, fullName: $('su_name').value, email: $('su_email').value, phone: $('su_phone').value, password: $('su_pass').value }),
      });
      const data = await res.json();
      if(!res.ok){ setStatus((data.error && data.error.formErrors ? data.error.formErrors.join(' ') : data.error) || 'Signup failed', 'err'); return; }
      setStatus('Account created!', 'ok');
      afterAuth(data);
    }catch(e){ setStatus('Network error — please try again.', 'err'); }
  });

  $('doLogin').addEventListener('click', async () => {
    setStatus('Signing in…');
    try{
      const res = await fetch('/api/customers/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ slug: SLUG, email: $('li_email').value, password: $('li_pass').value }),
      });
      const data = await res.json();
      if(!res.ok){ setStatus(data.error || 'Invalid email or password', 'err'); return; }
      setStatus('Signed in!', 'ok');
      afterAuth(data);
    }catch(e){ setStatus('Network error — please try again.', 'err'); }
  });

  $('accountBtn').addEventListener('click', () => {
    if(state.customer){ return; } // already signed in — nothing to do from here
    openSheet('authOverlay');
  });

  // Restore an existing sign-in on this device for this store
  (async function restoreCustomer(){
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token) return;
    try{
      const res = await fetch('/api/customers/me', { headers: { Authorization: 'Bearer ' + token } });
      if(!res.ok){ localStorage.removeItem(TOKEN_KEY); return; }
      const data = await res.json();
      state.customer = data;
      $('accountBtn').textContent = data.fullName.split(' ')[0];
    }catch(e){}
  })();

  // ---- Checkout ----
  $('checkoutBtn').addEventListener('click', () => {
    closeSheet('cartOverlay');
    if(!state.customer){ openSheet('authOverlay'); return; }
    openSheet('fulfillOverlay');
  });

  $('placeOrderBtn').addEventListener('click', async () => {
    const fulfillMsg = $('fulfillMsg');
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token){ fulfillMsg.textContent = 'Please sign in again.'; fulfillMsg.style.color = 'var(--err)'; return; }
    const items = cartEntries().map(e => ({ productId: e.product.id, quantity: e.qty }));
    if(!items.length){ fulfillMsg.textContent = 'Your cart is empty.'; fulfillMsg.style.color = 'var(--err)'; return; }
    fulfillMsg.textContent = 'Placing order…'; fulfillMsg.style.color = 'var(--ink-soft)';
    const placeBtn = $('placeOrderBtn'); placeBtn.disabled = true;
    try{
      const res = await fetch('/api/shop/order/place', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
        body: JSON.stringify({ slug: SLUG, items, fulfillment: $('fulfillText').value || undefined }),
      });
      const order = await res.json();
      if(!res.ok){ fulfillMsg.textContent = order.error || 'Could not place order.'; fulfillMsg.style.color = 'var(--err)'; placeBtn.disabled = false; return; }

      // Build the confirmation from what we already know client-side
      // (the API returns ids/quantities — names/prices we already have).
      const rows = cartEntries().map(e =>
        '<div class="receipt-meta"><span>'+escapeText(e.product.name)+' × '+e.qty+'</span><span>'+money(e.product.price*e.qty)+'</span></div>'
      ).join('');
      $('confirmBody').innerHTML =
        '<div class="receipt-meta"><span>Order #'+String(order.id).slice(0,8).toUpperCase()+'</span><span>'+new Date(order.createdAt||Date.now()).toLocaleString()+'</span></div>'
        + '<hr style="border:none;border-top:1px solid var(--paper);margin:8px 0;">'
        + rows
        + '<hr style="border:none;border-top:1px solid var(--paper);margin:8px 0;">'
        + '<div class="receipt-meta" style="font-weight:700;color:var(--ink);"><span>Total</span><span>'+money(order.total)+'</span></div>';

      // Reflect the purchase in the on-screen stock immediately — the
      // server already decremented real stock; without this the grid
      // would show stale numbers/enabled Add buttons until a manual
      // page reload.
      cartEntries().forEach(e => { e.product.stock = Math.max(0, e.product.stock - e.qty); });
      state.cart = {};
      renderGrid(); renderCartBar(); renderCartSheet();
      closeSheet('fulfillOverlay');
      openSheet('confirmOverlay');
      placeBtn.disabled = false;
      $('fulfillText').value = '';
      fulfillMsg.textContent = '';
    }catch(e){
      fulfillMsg.textContent = 'Network error — please try again.'; fulfillMsg.style.color = 'var(--err)';
      placeBtn.disabled = false;
    }
  });

  renderGrid();
  renderCartBar();
  renderCartSheet();
})();
</script>
</body>
</html>`);
});

module.exports = router;
