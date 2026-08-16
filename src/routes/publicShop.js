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
// Plain HTML + vanilla JS (no build step), full storefront: hero carousel,
// search, categories, cart, sign up/sign in, and real checkout — wired
// straight into the existing /api/shop and /api/customers routes.
//
// NOTE: this intentionally does NOT include the "Ask AI to shop" assistant
// from the admin-side preview build. That widget calls api.anthropic.com
// directly from the browser with no API key, which only works inside the
// Claude.ai artifact preview environment (which proxies/injects credentials
// automatically) — it will not function on a real deployment. To bring that
// feature here for real, add a POST /api/shop/ai-assist route that holds
// ANTHROPIC_API_KEY server-side and proxies the request; the front-end here
// can then call that route instead of api.anthropic.com directly.
router.get('/:slug', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, slug: true, name: true, logoUrl: true, currency: true, description: true },
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

  // ---- Hero carousel slides (server-rendered, real data) ----
  const inStock = products.filter((p) => (p.stock || 0) > 0);
  const pool = inStock.length ? inStock : products;
  const featuredPicks = [];
  if (pool.length) {
    const step = Math.max(1, Math.floor(pool.length / 3));
    for (let i = 0; i < pool.length && featuredPicks.length < 3; i += step) featuredPicks.push(pool[i]);
  }
  const bizName = escapeHtml(business.name || 'our store');
  const heroSlides = [];
  heroSlides.push(`
    <div class="hero-media"><div class="hero-fallback"></div></div>
    <div class="hero-overlay"></div>
    <div class="hero-copy">
      <span class="hero-eyebrow">Welcome</span>
      <h2>Welcome to ${bizName}</h2>
      <p>${business.description ? escapeHtml(business.description) : 'Freshly stocked shelves, friendly service, and fast delivery — right to your door.'}</p>
      <button class="hero-cta" data-hero-cta>Shop now</button>
    </div>`);
  featuredPicks.forEach((p, i) => {
    const eyebrows = ['Now in stock', 'Customer favorite', 'Fresh this week'];
    heroSlides.push(`
      <div class="hero-media">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : '<div class="hero-fallback"></div>'}</div>
      <div class="hero-overlay"></div>
      <div class="hero-copy">
        <span class="hero-eyebrow">${eyebrows[i % eyebrows.length]}</span>
        <h2>${escapeHtml(p.name)}</h2>
        <div class="hero-price-badge">${currency} ${Number(p.price || 0).toFixed(2)}</div>
        <p>Grab it while it lasts — added fresh to the shelf.</p>
        <button class="hero-cta" data-hero-cta>Shop now</button>
      </div>`);
  });
  heroSlides.push(`
    <div class="hero-media"><div class="hero-fallback"></div></div>
    <div class="hero-overlay"></div>
    <div class="hero-copy">
      <span class="hero-eyebrow">Trusted by neighbours</span>
      <h2>Shop with confidence</h2>
      <p>Real people, real quality checks — every order picked and packed with care before it reaches your door.</p>
      <button class="hero-cta" data-hero-cta>Browse the shop</button>
    </div>`);
  const heroHtml = `
    <section class="hero-carousel" aria-label="Store highlights" data-hero-carousel>
      ${heroSlides.map((html, i) => `<div class="hero-slide${i === 0 ? ' active' : ''}" data-hero-slide="${i}">${html}</div>`).join('')}
      <div class="hero-dots">${heroSlides.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div>
    </section>`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(business.name)} — Shop</title>
<style>
  :root{ --ink:#14181C; --ink-soft:#5B6672; --line:#D6DEE3; --paper:#F1F4F6; --brand:#E0762A; --brand-dark:#B8571A; --ok:#1F8A5A; --err:#B23A2E; --forest:#14472F; --gold:#E8963E; --terracotta:#E0762A; }
  *{box-sizing:border-box;}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:var(--paper);color:var(--ink);}
  header{background:var(--ink);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:5;}
  .avatar{width:34px;height:34px;border-radius:8px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;overflow:hidden;}
  .avatar img{width:100%;height:100%;object-fit:cover;}
  header h1{margin:0;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #accountBtn{background:none;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer;}
  #cartBtn{background:none;border:none;color:#fff;cursor:pointer;position:relative;padding:6px;font-size:20px;line-height:1;}
  #cartCount{position:absolute;top:0;right:0;background:var(--brand);color:#fff;font-size:10px;font-weight:700;border-radius:999px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 3px;}

  /* Hero carousel */
  .hero-carousel{position:relative;width:100%;height:300px;overflow:hidden;background:var(--forest);}
  .hero-slide{position:absolute;inset:0;opacity:0;z-index:0;transition:opacity 0.85s ease;}
  .hero-slide.active{opacity:1;z-index:1;}
  .hero-media{position:absolute;inset:0;overflow:hidden;}
  .hero-media img, .hero-fallback{width:100%;height:100%;object-fit:cover;}
  .hero-fallback{background:linear-gradient(135deg,var(--forest) 0%,#123024 55%,var(--gold) 160%);}
  .hero-overlay{position:absolute;inset:0;background:linear-gradient(100deg,rgba(15,25,18,0.82) 0%,rgba(15,25,18,0.5) 55%,rgba(15,25,18,0.16) 100%);}
  .hero-copy{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 24px;max-width:440px;color:#fff;}
  .hero-eyebrow{font-size:11.5px;letter-spacing:0.1em;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:8px;}
  .hero-copy h2{font-size:24px;line-height:1.15;margin:0 0 10px;font-weight:700;color:#fff;}
  .hero-copy p{font-size:13.5px;line-height:1.5;color:rgba(255,255,255,0.85);margin:0 0 16px;}
  .hero-price-badge{display:inline-block;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.3);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:12px;width:fit-content;}
  .hero-cta{align-self:flex-start;background:var(--terracotta);color:#fff;border:none;padding:10px 20px;border-radius:10px;font-size:13.5px;font-weight:700;cursor:pointer;}
  .hero-cta:hover{background:#e0522c;}
  .hero-dots{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:7px;z-index:2;}
  .hero-dots span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.4);transition:background .3s, transform .3s;}
  .hero-dots span.active{background:#fff;transform:scale(1.25);}

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

  @media(max-width:600px){ .hero-carousel{height:240px;} .hero-copy h2{font-size:19px;} .hero-copy p{font-size:12.5px;} }

  /* AI shopping assistant */
  .ai-fab{position:fixed;right:18px;bottom:80px;z-index:40;display:flex;align-items:center;gap:8px;background:var(--forest);color:#fff;border:none;border-radius:999px;padding:12px 16px 12px 12px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px -8px rgba(15,25,18,0.5);}
  .ai-fab:hover{background:#1a5a3c;}
  .ai-fab-ic{width:20px;height:20px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--forest);font-size:12px;}
  @media(max-width:600px){ .ai-fab span.ai-fab-label{display:none;} .ai-fab{padding:13px;bottom:76px;} }
  .ai-panel-overlay{position:fixed;inset:0;background:rgba(15,17,17,0.4);z-index:60;display:none;align-items:flex-end;justify-content:flex-end;}
  .ai-panel-overlay.open{display:flex;}
  .ai-panel{width:100%;max-width:380px;background:#fff;height:100%;display:flex;flex-direction:column;box-shadow:-12px 0 32px rgba(15,17,17,0.14);}
  .ai-panel-head{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid var(--line);flex-shrink:0;background:var(--forest);color:#fff;}
  .ai-panel-head .ttl{flex:1;}
  .ai-panel-head .ttl strong{display:block;font-size:14px;}
  .ai-panel-head .ttl span{font-size:11px;color:rgba(255,255,255,0.65);}
  .ai-panel-head button{background:rgba(255,255,255,0.12);border:none;width:26px;height:26px;border-radius:50%;color:#fff;font-size:12px;cursor:pointer;flex-shrink:0;}
  .ai-panel-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}
  .ai-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.4;}
  .ai-msg.assistant{background:var(--paper);color:var(--ink);align-self:flex-start;border-bottom-left-radius:3px;}
  .ai-msg.user{background:var(--forest);color:#fff;align-self:flex-end;border-bottom-right-radius:3px;}
  .ai-chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
  .ai-chip-row button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 10px;font-size:11.5px;cursor:pointer;}
  .ai-typing{display:flex;gap:4px;align-self:flex-start;padding:8px 12px;}
  .ai-typing span{width:6px;height:6px;border-radius:50%;background:var(--ink-soft);opacity:.5;animation:aiBlink 1s infinite;}
  .ai-typing span:nth-child(2){animation-delay:.2s;} .ai-typing span:nth-child(3){animation-delay:.4s;}
  @keyframes aiBlink{0%,80%,100%{opacity:.3;}40%{opacity:1;}}
  .ai-suggest-row{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;}
  .ai-suggest-row button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 11px;font-size:11.5px;cursor:pointer;}
  .ai-panel-foot{border-top:1px solid var(--line);padding:10px;display:flex;gap:8px;flex-shrink:0;}
  .ai-panel-foot input{flex:1;border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:13px;}
  .ai-panel-foot button{background:var(--forest);color:#fff;border:none;border-radius:10px;padding:0 14px;font-weight:700;font-size:13px;cursor:pointer;}
  .ai-panel-foot button:disabled{opacity:.5;cursor:not-allowed;}
</style>
</head>
<body>
<header>
  <div class="avatar" id="bizAvatar">${business.logoUrl ? `<img src="${escapeHtml(business.logoUrl)}" alt="">` : escapeHtml(initial)}</div>
  <h1>${escapeHtml(business.name)}</h1>
  <button id="accountBtn">Sign in</button>
  <button id="cartBtn">🛒<span id="cartCount" style="display:none;">0</span></button>
</header>

${heroHtml}

<div class="searchWrap"><input id="search" placeholder="Search ${escapeHtml(business.name)}"></div>
<div class="chips" id="chips">
  <button class="chip active" data-cat="">All</button>
  ${categories.map((c) => `<button class="chip" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
</div>

<main id="grid">
  ${products.length === 0 ? '<div class="empty">No products available yet — check back soon.</div>' : ''}
</main>

<div id="cartBar"><span id="cartSummary"></span><button id="openCartBtn">View cart</button></div>

<button class="ai-fab" id="aiFabBtn" aria-label="Open shopping assistant">
  <span class="ai-fab-ic">✦</span>
  <span class="ai-fab-label">Ask AI to shop</span>
</button>
<div class="ai-panel-overlay" id="aiPanelOverlay">
  <div class="ai-panel">
    <div class="ai-panel-head">
      <span class="ai-fab-ic">✦</span>
      <div class="ttl"><strong>Shopping Assistant</strong><span>Ask me to add items or plan a meal</span></div>
      <button id="closeAiPanel" aria-label="Close assistant">✕</button>
    </div>
    <div class="ai-panel-body" id="aiPanelBody"></div>
    <div class="ai-suggest-row" id="aiQuickRow">
      <button data-ai-quick="Add 5 eggs to my cart">Add 5 eggs to my cart</button>
      <button data-ai-quick="I want to make stew — what do I need?">I want to make stew — what do I need?</button>
      <button data-ai-quick="What can I make for breakfast?">What can I make for breakfast?</button>
    </div>
    <form class="ai-panel-foot" id="aiForm">
      <input type="text" id="aiInputField" placeholder="e.g. Add 10 soaps to my cart" autocomplete="off"/>
      <button type="submit" id="aiSendBtn">Send</button>
    </form>
  </div>
</div>

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

  // ---- Hero carousel (auto-rotate + CTA scrolls to products) ----
  (function initHero(){
    const heroEl = document.querySelector('[data-hero-carousel]');
    if(!heroEl) return;
    const slides = Array.from(heroEl.querySelectorAll('.hero-slide'));
    const dots = Array.from(heroEl.querySelectorAll('.hero-dots span'));
    let idx = 0;
    function show(i){
      slides.forEach(s=>s.classList.remove('active'));
      dots.forEach(d=>d.classList.remove('active'));
      idx = (i + slides.length) % slides.length;
      slides[idx].classList.add('active');
      if(dots[idx]) dots[idx].classList.add('active');
    }
    if(slides.length > 1){
      setInterval(()=> show(idx+1), 5000);
    }
    heroEl.querySelectorAll('[data-hero-cta]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.getElementById('search').scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
  })();

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

      const rows = cartEntries().map(e =>
        '<div class="receipt-meta"><span>'+escapeText(e.product.name)+' × '+e.qty+'</span><span>'+money(e.product.price*e.qty)+'</span></div>'
      ).join('');
      $('confirmBody').innerHTML =
        '<div class="receipt-meta"><span>Order #'+String(order.id).slice(0,8).toUpperCase()+'</span><span>'+new Date(order.createdAt||Date.now()).toLocaleString()+'</span></div>'
        + '<hr style="border:none;border-top:1px solid var(--paper);margin:8px 0;">'
        + rows
        + '<hr style="border:none;border-top:1px solid var(--paper);margin:8px 0;">'
        + '<div class="receipt-meta" style="font-weight:700;color:var(--ink);"><span>Total</span><span>'+money(order.total)+'</span></div>';

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

  // ---- AI shopping assistant ----
  // Calls our own server (/api/shop/ai-assist), which holds the Anthropic
  // API key and does the actual model call — the browser never sees the key.
  const aiState = { messages: [], busy: false, greeted: false };
  function aiMsgHtml(role, text){
    return '<div class="ai-msg '+role+'">'+escapeText(text)+'</div>';
  }
  function renderAiBody(){
    const body = $('aiPanelBody');
    if(!aiState.greeted && aiState.messages.length === 0){
      body.innerHTML = aiMsgHtml('assistant', "Hi! I'm your shopping assistant for "+ (document.title.split(' — ')[0] || 'this store') +". Ask me to add things to your cart, or tell me what you're cooking and I'll work out what you need from what's on the shelf.");
    } else {
      body.innerHTML = aiState.messages.map(m => {
        let html = aiMsgHtml(m.role, m.text);
        if(m.role === 'assistant' && (m.suggestions||[]).length){
          html += '<div class="ai-chip-row">'+m.suggestions.map(s=>{
            const p = PRODUCTS.find(pp=>pp.id===s.productId);
            return p ? '<button data-ai-add="'+p.id+'" data-ai-qty="'+s.qty+'">+ '+escapeText(p.name)+(s.qty>1?' ×'+s.qty:'')+'</button>' : '';
          }).join('')+'</div>';
        }
        return html;
      }).join('');
    }
    if(aiState.busy) body.innerHTML += '<div class="ai-typing"><span></span><span></span><span></span></div>';
    body.scrollTop = body.scrollHeight;
    $('aiQuickRow').style.display = aiState.messages.length === 0 ? 'flex' : 'none';
  }
  $('aiPanelBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ai-add]');
    if(!btn) return;
    const qty = (state.cart[btn.getAttribute('data-ai-add')]?.qty || 0) + Number(btn.getAttribute('data-ai-qty')||1);
    setQty(btn.getAttribute('data-ai-add'), qty);
    btn.textContent = 'Added ✓';
    btn.disabled = true;
  });

  $('aiFabBtn').addEventListener('click', () => { openSheet2('aiPanelOverlay'); renderAiBody(); $('aiInputField').focus(); });
  $('closeAiPanel').addEventListener('click', () => closeSheet2('aiPanelOverlay'));
  function openSheet2(id){ $(id).classList.add('open'); }
  function closeSheet2(id){ $(id).classList.remove('open'); }

  document.querySelectorAll('[data-ai-quick]').forEach(btn=>{
    btn.addEventListener('click', () => sendAiMessage(btn.getAttribute('data-ai-quick')));
  });

  $('aiForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('aiInputField').value.trim();
    if(!val || aiState.busy) return;
    $('aiInputField').value = '';
    sendAiMessage(val);
  });

  async function sendAiMessage(text){
    if(aiState.busy) return;
    aiState.messages.push({ role:'user', text });
    aiState.busy = true;
    renderAiBody();
    $('aiSendBtn').disabled = true; $('aiInputField').disabled = true;
    try{
      const res = await fetch('/api/shop/ai-assist', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          slug: SLUG, message: text,
          history: aiState.messages.slice(0,-1).slice(-10),
        }),
      });
      const data = await res.json();
      if(!res.ok){
        aiState.messages.push({ role:'assistant', text: data.error || "Sorry, I'm having trouble right now — please try again." });
      } else {
        (data.actions||[]).forEach(a => {
          const qty = (state.cart[a.productId]?.qty || 0) + a.qty;
          setQty(a.productId, qty);
        });
        aiState.messages.push({ role:'assistant', text: data.reply || '', suggestions: data.suggestions || [] });
      }
    }catch(e){
      aiState.messages.push({ role:'assistant', text: "Network error — please try again." });
    }
    aiState.busy = false;
    $('aiSendBtn').disabled = false; $('aiInputField').disabled = false;
    renderAiBody();
    $('aiInputField').focus();
  }

  renderGrid();
  renderCartBar();
  renderCartSheet();
})();
</script>
</body>
</html>`);
});

module.exports = router;
