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
// Plain HTML + vanilla JS (no build step). Full storefront: signup-first
// landing, hero carousel, grid catalog with search/category/in-stock
// filters, a real cart page, delivery details with saved GPS address,
// auto-printed receipt, and account/profile management — wired straight
// into the existing /api/shop and /api/customers routes.
//
// NOTE: the "Ask AI to shop" widget calls our own /api/shop/ai-assist route
// (see routes/shopAI.js), which holds ANTHROPIC_API_KEY server-side.
router.get('/:slug', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, slug: true, name: true, logoUrl: true, currency: true, supportPhone: true, category: true, description: true, coverUrl: true, openTime: true, closeTime: true, deliveryInfo: true },
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

  const inStock = products.filter((p) => (p.stock || 0) > 0);
  const pool = inStock.length ? inStock : products;
  const featuredPicks = [];
  if (pool.length) {
    const step = Math.max(1, Math.floor(pool.length / 3));
    for (let i = 0; i < pool.length && featuredPicks.length < 3; i += step) featuredPicks.push(pool[i]);
  }
  const bizName = escapeHtml(business.name || 'our store');
  const hoursText = (business.openTime && business.closeTime) ? `Open ${escapeHtml(business.openTime)} – ${escapeHtml(business.closeTime)}` : '';
  const welcomeDesc = business.description
    ? escapeHtml(business.description)
    : 'Freshly stocked shelves, friendly service, and fast delivery — right to your door.';
  const heroSlides = [];
  heroSlides.push(`
    <div class="hero-media">${business.coverUrl ? `<img src="${escapeHtml(business.coverUrl)}" alt="">` : '<div class="hero-fallback"></div>'}</div>
    <div class="hero-overlay"></div>
    <div class="hero-copy">
      <span class="hero-eyebrow">Welcome</span>
      <h2>Welcome to ${bizName}</h2>
      <p>${welcomeDesc}${hoursText ? ` · ${hoursText}` : ''}</p>
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
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#E0762A">
<style>
  :root{ --ink:#14181C; --ink-soft:#5B6672; --line:#D6DEE3; --paper:#F1F4F6; --brand:#E0762A; --brand-dark:#B8571A; --ok:#1F8A5A; --err:#B23A2E; --forest:#14472F; --gold:#E8963E; --terracotta:#E0762A; }
  *{box-sizing:border-box;}
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:var(--paper);color:var(--ink);}
  .hidden{display:none !important;}
  header{background:var(--ink);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:5;}
  .avatar{width:34px;height:34px;border-radius:8px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;overflow:hidden;}
  .avatar img{width:100%;height:100%;object-fit:cover;}
  header h1{margin:0;font-size:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  header .support-link{color:rgba(255,255,255,0.75);font-size:11px;text-decoration:none;border:1px solid rgba(255,255,255,0.25);border-radius:14px;padding:5px 9px;white-space:nowrap;}
  .store-info-strip{max-width:720px;margin:0 auto;padding:6px 16px 0;font-size:11.5px;color:var(--ink-soft);}
  .delivery-note{background:var(--paper);border-radius:8px;padding:10px 12px;font-size:12.5px;color:var(--ink);margin-bottom:14px;}
  .order-card{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;}
  .order-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
  .order-card-head .oid{font-size:12.5px;font-weight:700;}
  .order-card-head .odate{font-size:11px;color:var(--ink-soft);}
  .status-pill{display:inline-block;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;}
  .status-pill.pending{background:#FBEEE4;color:#9C5716;}
  .status-pill.confirmed{background:#E3ECFB;color:#2255A4;}
  .status-pill.preparing{background:#FDF3D6;color:#8A6D1B;}
  .status-pill.ready{background:#E6F0FB;color:#1D5FA8;}
  .status-pill.delivered{background:#E1F0E6;color:var(--ok);}
  .status-pill.cancelled{background:#F6E3E1;color:var(--err);}
  .order-card .oitems{font-size:12px;color:var(--ink-soft);margin:8px 0;}
  .order-card .ototal{display:flex;justify-content:space-between;font-weight:700;font-size:13.5px;padding-top:8px;border-top:1px solid var(--paper);}
  .orders-empty{text-align:center;color:var(--ink-soft);padding:60px 0;font-size:14px;}
  #accountBtn{background:none;border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:16px;padding:6px 10px;font-size:12px;cursor:pointer;}
  #backBtn{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:2px 4px;}
  #cartBtn{background:none;border:none;color:#fff;cursor:pointer;position:relative;padding:6px;font-size:20px;line-height:1;}
  #cartCount{position:absolute;top:0;right:0;background:var(--brand);color:#fff;font-size:10px;font-weight:700;border-radius:999px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 3px;}

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
  @media(max-width:600px){ .hero-carousel{height:240px;} .hero-copy h2{font-size:19px;} .hero-copy p{font-size:12.5px;} }

  .filterWrap{max-width:720px;margin:0 auto;padding:12px 16px 4px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
  #search{flex:1;min-width:160px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;}
  #categorySelect{padding:10px 10px;border:1px solid var(--line);border-radius:10px;font-size:13px;background:#fff;color:var(--ink);}
  .instock-toggle{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-soft);white-space:nowrap;padding:0 4px;}
  .instock-toggle input{width:16px;height:16px;}

  main{max-width:720px;margin:0 auto;padding:10px 16px 90px;}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
  @media(min-width:520px){ .grid{gap:10px;} }
  .card{background:#fff;border-radius:10px;padding:7px;display:flex;flex-direction:column;}
  .card .thumb{width:100%;aspect-ratio:1/1;border-radius:7px;background:var(--paper);display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--ink-soft);font-size:20px;margin-bottom:6px;}
  .card .thumb img{width:100%;height:100%;object-fit:cover;}
  .card h3{margin:0 0 2px;font-size:11.5px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .card .cat{margin:0;color:var(--ink-soft);font-size:9.5px;}
  .card .price{font-weight:700;color:var(--brand-dark);font-size:11.5px;margin-top:4px;}
  .card .stock-low{color:var(--err);font-size:9px;margin:2px 0 0;}
  .card .addBtn{margin-top:6px;background:var(--brand);color:#fff;border:none;border-radius:7px;padding:6px 0;font-size:10.5px;font-weight:700;cursor:pointer;width:100%;}
  .card .addBtn:disabled{background:#C7CDD3;cursor:not-allowed;}
  .card .qtyStep{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:6px;}
  .card .qtyStep button{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);background:#fff;font-size:13px;cursor:pointer;flex-shrink:0;}
  .empty{grid-column:1/-1;text-align:center;color:var(--ink-soft);padding:40px 0;font-size:14px;}

  #cartBar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:12px 16px;display:none;justify-content:space-between;align-items:center;max-width:720px;margin:0 auto;box-shadow:0 -4px 14px rgba(0,0,0,.06);}
  #cartBar button{background:var(--brand);color:#fff;border:none;border-radius:20px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;}

  .page-view{max-width:520px;margin:0 auto;padding:20px 16px 40px;min-height:60vh;}
  .page-view h2{font-size:19px;margin:0 0 4px;}
  .page-view .sub{color:var(--ink-soft);font-size:13px;margin:0 0 18px;}
  .field{margin-bottom:12px;}
  .field label{display:block;font-size:12px;color:var(--ink-soft);margin-bottom:4px;}
  .field input, .field textarea{width:100%;padding:11px;border:1px solid var(--line);border-radius:8px;font-size:14px;}
  .field textarea{resize:vertical;}
  .pw-wrap{position:relative;}
  .pw-wrap input{padding-right:44px;}
  .pw-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--ink-soft);font-size:12px;cursor:pointer;padding:4px;}
  .tabs{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:16px;}
  .tabs button{flex:1;background:#fff;border:none;padding:10px;font-size:13px;cursor:pointer;color:var(--ink-soft);}
  .tabs button.active{background:var(--ink);color:#fff;}
  .fullBtn{width:100%;background:var(--brand);color:#fff;border:none;border-radius:22px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;margin-top:6px;}
  .fullBtn:disabled{background:#C7CDD3;cursor:not-allowed;}
  .ghostBtn{width:100%;background:none;border:1px solid var(--line);border-radius:22px;padding:11px;font-size:13px;cursor:pointer;margin-top:8px;color:var(--ink);}
  .linklike{background:none;border:none;color:var(--forest);font-size:12.5px;cursor:pointer;text-decoration:underline;padding:4px 0;}
  #statusMsg{font-size:13px;margin-top:8px;text-align:center;min-height:16px;}
  #statusMsg.err{color:var(--err);}
  #statusMsg.ok{color:var(--ok);}

  .cartRow{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--paper);gap:10px;}
  .cartRow .name{font-size:13.5px;flex:1;min-width:0;}
  .cartRow .qtyStep{display:flex;align-items:center;gap:6px;flex-shrink:0;}
  .cartRow .qtyStep button{width:26px;height:26px;border-radius:6px;border:1px solid var(--line);background:#fff;font-size:14px;cursor:pointer;}
  .cartRow .linePrice{font-size:13px;font-weight:700;white-space:nowrap;width:70px;text-align:right;}
  .subtotalRow{display:flex;justify-content:space-between;font-weight:700;padding:14px 0 6px;font-size:16px;}
  .cart-empty{text-align:center;color:var(--ink-soft);padding:60px 0;font-size:14px;}

  .gpsRow{display:flex;gap:8px;align-items:center;margin-bottom:6px;}
  .gpsRow button{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-size:12.5px;cursor:pointer;color:var(--ink);white-space:nowrap;}
  .gps-note{font-size:11.5px;color:var(--ink-soft);margin:2px 0 12px;}
  .save-toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);margin:10px 0 6px;}

  .receipt-head{text-align:center;margin-bottom:12px;}
  .receipt-head .tick{width:44px;height:44px;border-radius:50%;background:#E6F4EC;color:var(--ok);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px;}
  .receipt-meta{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);padding:4px 0;}
  .receipt-box{background:#fff;border-radius:12px;padding:16px;}
  @media print{
    body *{visibility:hidden;}
    .receipt-print, .receipt-print *{visibility:visible;}
    .receipt-print{position:absolute;top:0;left:0;width:100%;padding:20px;}
  }

  .ai-fab{position:fixed;right:18px;bottom:80px;z-index:40;display:flex;align-items:center;gap:8px;background:var(--forest);color:#fff;border:none;border-radius:999px;padding:12px 16px 12px 12px;font-size:13px;font-weight:700;cursor:grab;box-shadow:0 10px 24px -8px rgba(15,25,18,0.5);touch-action:none;user-select:none;}
  .ai-fab:active{cursor:grabbing;}
  .ai-fab-ic{width:20px;height:20px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--forest);font-size:12px;}
  @media(max-width:600px){ .ai-fab span.ai-fab-label{display:none;} .ai-fab{padding:13px;} }
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

<div id="authView" class="page-view">
  <div class="avatar" id="authAvatar" style="margin-bottom:14px;">${business.logoUrl ? `<img src="${escapeHtml(business.logoUrl)}" alt="">` : escapeHtml(initial)}</div>
  <h2>${escapeHtml(business.name)}</h2>
  <p class="sub">Create an account to start shopping</p>
  <div class="tabs">
    <button id="tabSignup" class="active">New customer</button>
    <button id="tabLogin">Returning</button>
  </div>
  <div id="signupFields">
    <div class="field"><label>Full name</label><input id="su_name" autocomplete="name"></div>
    <div class="field"><label>Email</label><input id="su_email" type="email" autocomplete="email"></div>
    <div class="field"><label>Phone number</label><input id="su_phone" type="tel" autocomplete="tel"></div>
    <div class="field"><label>Password (min 8 characters)</label>
      <div class="pw-wrap"><input id="su_pass" type="password" autocomplete="new-password"><button type="button" class="pw-toggle" data-pw-toggle="su_pass">Show</button></div>
    </div>
    <button class="fullBtn" id="doSignup">Create account</button>
  </div>
  <div id="loginFields" style="display:none;">
    <div class="field"><label>Email</label><input id="li_email" type="email" autocomplete="email"></div>
    <div class="field"><label>Password</label>
      <div class="pw-wrap"><input id="li_pass" type="password" autocomplete="current-password"><button type="button" class="pw-toggle" data-pw-toggle="li_pass">Show</button></div>
    </div>
    <button class="fullBtn" id="doLogin">Sign in</button>
    <button type="button" class="linklike" id="forgotPwBtn">Forgot password?</button>
  </div>
  <p id="statusMsg"></p>
  ${business.supportPhone ? `<p style="text-align:center;font-size:12px;color:var(--ink-soft);margin-top:18px;">Need help? Call the store at <a href="tel:${escapeHtml(business.supportPhone)}" style="color:var(--forest);">${escapeHtml(business.supportPhone)}</a></p>` : ''}
</div>

<div id="shopView" class="hidden">
  <header>
    <div class="avatar" id="bizAvatar">${business.logoUrl ? `<img src="${escapeHtml(business.logoUrl)}" alt="">` : escapeHtml(initial)}</div>
    <h1>${escapeHtml(business.name)}</h1>
    ${business.supportPhone ? `<a class="support-link" href="tel:${escapeHtml(business.supportPhone)}">☎ Support</a>` : ''}
    <button id="accountBtn">Account</button>
    <button id="cartBtn">🛒<span id="cartCount" style="display:none;">0</span></button>
  </header>
  ${(business.category || hoursText) ? `<div class="store-info-strip">${[business.category ? escapeHtml(business.category) : '', hoursText].filter(Boolean).join(' · ')}</div>` : ''}

  ${heroHtml}

  <div class="filterWrap">
    <input id="search" placeholder="Search ${escapeHtml(business.name)}">
    <select id="categorySelect">
      <option value="">All categories</option>
      ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
    </select>
    <label class="instock-toggle"><input type="checkbox" id="inStockOnly"> In stock only</label>
  </div>

  <main id="grid">
    ${products.length === 0 ? '<div class="empty">No products available yet — check back soon.</div>' : ''}
  </main>

  <div id="cartBar"><span id="cartSummary"></span><button id="openCartBtn">View cart</button></div>
</div>

<div id="cartView" class="hidden">
  <header><button id="cartBackBtn">←</button><h1>Your cart</h1></header>
  <div class="page-view" id="cartPageBody"></div>
</div>

<div id="deliveryView" class="hidden">
  <header><button id="deliveryBackBtn">←</button><h1>Delivery details</h1></header>
  <div class="page-view">
    ${business.deliveryInfo ? `<p class="delivery-note">${escapeHtml(business.deliveryInfo)}</p>` : ''}
    <div class="field"><label>Full name</label><input id="dv_name"></div>
    <div class="field"><label>Phone number</label><input id="dv_phone" type="tel"></div>
    <div class="field">
      <label>Delivery address, or write "Pickup"</label>
      <textarea id="dv_address" rows="3" placeholder="e.g. 12 Ring Road, Accra — or Pickup"></textarea>
    </div>
    <div class="gpsRow">
      <button type="button" id="useGpsBtn">📍 Use my current location</button>
      <span id="gpsStatus" style="font-size:11.5px;color:var(--ink-soft);"></span>
    </div>
    <p class="gps-note">This captures your device's coordinates so the store can locate you precisely — please still describe the address above in words.</p>
    <label class="save-toggle"><input type="checkbox" id="saveAddressChk" checked> Save this address for next time</label>
    <button class="fullBtn" id="placeOrderBtn">Confirm order</button>
    <p id="fulfillMsg" style="font-size:13px;margin-top:8px;text-align:center;"></p>
  </div>
</div>

<div id="receiptView" class="hidden">
  <header><button id="receiptBackBtn">←</button><h1>Order confirmed</h1></header>
  <div class="page-view">
    <div class="receipt-box receipt-print" id="receiptBox">
      <div class="receipt-head">
        <div class="tick">✓</div>
        <h2 style="margin:0;">Order placed</h2>
        <p style="margin:4px 0 0;color:var(--ink-soft);font-size:13px;">The store has been notified</p>
      </div>
      <div id="confirmBody"></div>
    </div>
    <button class="fullBtn" id="printReceiptBtn">🖨 Print receipt</button>
    <button class="ghostBtn" id="trackOrderBtn">Track my orders</button>
    <button class="ghostBtn" id="continueShoppingBtn">Continue shopping</button>
  </div>
</div>

<div id="profileView" class="hidden">
  <header><button id="profileBackBtn">←</button><h1>My account</h1></header>
  <div class="page-view">
    <div class="field"><label>Full name</label><input id="pf_name"></div>
    <div class="field"><label>Email</label><input id="pf_email" disabled style="background:var(--paper);color:var(--ink-soft);"></div>
    <div class="field"><label>Phone number</label><input id="pf_phone" type="tel"></div>
    <div class="field"><label>Saved address</label><textarea id="pf_address" rows="3"></textarea></div>
    <button class="fullBtn" id="saveProfileBtn">Save changes</button>
    <p id="profileMsg" style="font-size:13px;margin-top:8px;text-align:center;"></p>
    <button class="ghostBtn" id="myOrdersBtn">My orders</button>
    <button class="ghostBtn" id="logoutBtn">Log out</button>
  </div>
</div>

<div id="ordersView" class="hidden">
  <header><button id="ordersBackBtn">←</button><h1>My orders</h1></header>
  <div class="page-view" id="ordersPageBody"></div>
</div>

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

<script>
(function(){
  const SLUG = ${JSON.stringify(business.slug)};
  const BIZ_NAME = ${JSON.stringify(business.name)};
  const CURRENCY = ${JSON.stringify(business.currency || '')};
  const PRODUCTS = ${JSON.stringify(products.map((p) => ({
    id: p.id, name: p.name, category: p.category || '', price: Number(p.price),
    stock: p.stock, image: p.image || null,
  })))};
  const TOKEN_KEY = 'shop_customer_token_' + SLUG;

  const state = { search: '', category: '', inStockOnly: false, cart: {}, customer: null, pendingGps: null };
  const money = (n) => CURRENCY + ' ' + Number(n || 0).toFixed(2);
  const $ = (id) => document.getElementById(id);
  function escapeText(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  const VIEWS = ['authView','shopView','cartView','deliveryView','receiptView','profileView','ordersView'];
  function showView(id){
    VIEWS.forEach(v => $(v).classList.toggle('hidden', v !== id));
    window.scrollTo(0,0);
  }

  document.querySelectorAll('[data-pw-toggle]').forEach(btn=>{
    btn.addEventListener('click', () => {
      const input = $(btn.getAttribute('data-pw-toggle'));
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
    });
  });

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
  $('forgotPwBtn').addEventListener('click', () => {
    setStatus(${JSON.stringify(business.supportPhone
      ? `Password resets aren't automated yet — please call the store at ${business.supportPhone} and they can help you back in.`
      : "Password resets aren't automated yet — please contact the store directly for help signing back in.")}, '');
  });

  function afterAuth(data){
    localStorage.setItem(TOKEN_KEY, data.token);
    state.customer = data.customer;
    enterShop();
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

  function enterShop(){
    showView('shopView');
    renderGrid(); renderCartBar();
  }

  (async function boot(){
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token){ showView('authView'); return; }
    try{
      const res = await fetch('/api/customers/me', { headers: { Authorization: 'Bearer ' + token } });
      if(!res.ok){ localStorage.removeItem(TOKEN_KEY); showView('authView'); return; }
      state.customer = await res.json();
      enterShop();
    }catch(e){ showView('authView'); }
  })();

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
    if(slides.length > 1) setInterval(()=> show(idx+1), 5000);
    heroEl.querySelectorAll('[data-hero-cta]').forEach(btn=>{
      btn.addEventListener('click', ()=> $('search').scrollIntoView({behavior:'smooth', block:'start'}));
    });
  })();

  function renderGrid(){
    const grid = $('grid');
    const term = state.search.trim().toLowerCase();
    const filtered = PRODUCTS.filter(p =>
      (!state.category || p.category === state.category) &&
      (!term || p.name.toLowerCase().includes(term)) &&
      (!state.inStockOnly || p.stock > 0)
    );
    if(!filtered.length){
      grid.innerHTML = '<div class="empty">No products match your search.</div>';
      grid.className = '';
      return;
    }
    grid.className = 'grid';
    grid.innerHTML = filtered.map(p => {
      const qty = state.cart[p.id] ? state.cart[p.id].qty : 0;
      const out = p.stock <= 0;
      const controls = qty > 0
        ? '<div class="qtyStep"><button data-dec="'+p.id+'">\u2212</button><span>'+qty+'</span><button data-inc="'+p.id+'" '+(qty>=p.stock?'disabled':'')+'>+</button></div>'
        : '<button class="addBtn" data-add="'+p.id+'" '+(out?'disabled':'')+'>'+(out?'Out of stock':'Add')+'</button>';
      return '<div class="card">'
        + '<div class="thumb">'+(p.image ? '<img src="'+p.image+'" alt="">' : '\uD83D\uDCE6')+'</div>'
        + '<h3>'+escapeText(p.name)+'</h3><p class="cat">'+escapeText(p.category||'')+'</p>'
        + (p.stock > 0 && p.stock <= 5 ? '<p class="stock-low">Only '+p.stock+' left</p>' : '')
        + '<div class="price">'+money(p.price)+'</div>'
        + controls
        + '</div>';
    }).join('');
  }
  $('grid').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    if(add) setQty(add.getAttribute('data-add'), 1);
    if(inc) setQty(inc.getAttribute('data-inc'), (state.cart[inc.getAttribute('data-inc')]?.qty || 0) + 1);
    if(dec) setQty(dec.getAttribute('data-dec'), (state.cart[dec.getAttribute('data-dec')]?.qty || 0) - 1);
  });
  $('search').addEventListener('input', e => { state.search = e.target.value; renderGrid(); });
  $('categorySelect').addEventListener('change', e => { state.category = e.target.value; renderGrid(); });
  $('inStockOnly').addEventListener('change', e => { state.inStockOnly = e.target.checked; renderGrid(); });

  function setQty(productId, qty){
    const product = PRODUCTS.find(p => p.id === productId);
    if(!product) return;
    qty = Math.max(0, Math.min(qty, product.stock));
    if(qty === 0) delete state.cart[productId];
    else state.cart[productId] = { product, qty };
    renderGrid(); renderCartBar();
    if(!$('cartView').classList.contains('hidden')) renderCartPage();
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

  function renderCartPage(){
    const entries = cartEntries();
    const body = $('cartPageBody');
    if(!entries.length){
      body.innerHTML = '<div class="cart-empty">Your cart is empty.</div><button class="ghostBtn" id="backToShopBtn">Browse products</button>';
      $('backToShopBtn').addEventListener('click', () => showView('shopView'));
      return;
    }
    body.innerHTML = entries.map(e =>
      '<div class="cartRow"><span class="name">'+escapeText(e.product.name)+'</span>'
      + '<div class="qtyStep"><button data-cart-dec="'+e.product.id+'">\u2212</button><span>'+e.qty+'</span><button data-cart-inc="'+e.product.id+'" '+(e.qty>=e.product.stock?'disabled':'')+'>+</button></div>'
      + '<span class="linePrice">'+money(e.product.price*e.qty)+'</span></div>'
    ).join('')
    + '<div class="subtotalRow"><span>Subtotal</span><span>'+money(cartTotal())+'</span></div>'
    + '<button class="fullBtn" id="goToDeliveryBtn">Place order</button>';
    body.querySelectorAll('[data-cart-inc]').forEach(b=> b.addEventListener('click', ()=> setQty(b.getAttribute('data-cart-inc'), (state.cart[b.getAttribute('data-cart-inc')]?.qty||0)+1)));
    body.querySelectorAll('[data-cart-dec]').forEach(b=> b.addEventListener('click', ()=> setQty(b.getAttribute('data-cart-dec'), (state.cart[b.getAttribute('data-cart-dec')]?.qty||0)-1)));
    $('goToDeliveryBtn').addEventListener('click', openDeliveryView);
  }
  $('cartBtn').addEventListener('click', () => { showView('cartView'); renderCartPage(); });
  $('openCartBtn').addEventListener('click', () => { showView('cartView'); renderCartPage(); });
  $('cartBackBtn').addEventListener('click', () => showView('shopView'));

  function openDeliveryView(){
    if(!cartEntries().length) return;
    $('dv_name').value = (state.customer && state.customer.fullName) || '';
    $('dv_phone').value = (state.customer && state.customer.phone) || '';
    $('dv_address').value = (state.customer && state.customer.address) || '';
    $('gpsStatus').textContent = (state.customer && state.customer.latitude) ? 'Location on file ✓' : '';
    $('fulfillMsg').textContent = '';
    showView('deliveryView');
  }
  $('deliveryBackBtn').addEventListener('click', () => showView('cartView'));

  $('useGpsBtn').addEventListener('click', () => {
    if(!navigator.geolocation){ $('gpsStatus').textContent = 'Location not supported on this device.'; return; }
    $('gpsStatus').textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.pendingGps = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        $('gpsStatus').textContent = 'Location captured ✓ — still describe your address above.';
      },
      () => { $('gpsStatus').textContent = 'Could not get your location — please allow location access and try again.'; },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  $('placeOrderBtn').addEventListener('click', async () => {
    const fulfillMsg = $('fulfillMsg');
    const token = localStorage.getItem(TOKEN_KEY);
    if(!token){ fulfillMsg.textContent = 'Please sign in again.'; fulfillMsg.style.color = 'var(--err)'; return; }
    const items = cartEntries().map(e => ({ productId: e.product.id, quantity: e.qty }));
    if(!items.length){ fulfillMsg.textContent = 'Your cart is empty.'; fulfillMsg.style.color = 'var(--err)'; return; }
    const addressText = $('dv_address').value.trim();
    if(!addressText){ fulfillMsg.textContent = 'Please add a delivery address (or write "Pickup").'; fulfillMsg.style.color = 'var(--err)'; return; }
    fulfillMsg.textContent = 'Placing order…'; fulfillMsg.style.color = 'var(--ink-soft)';
    const placeBtn = $('placeOrderBtn'); placeBtn.disabled = true;
    try{
      const res = await fetch('/api/shop/order/place', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
        body: JSON.stringify({ slug: SLUG, items, fulfillment: addressText }),
      });
      const order = await res.json();
      if(!res.ok){ fulfillMsg.textContent = order.error || 'Could not place order.'; fulfillMsg.style.color = 'var(--err)'; placeBtn.disabled = false; return; }

      if($('saveAddressChk').checked){
        try{
          const patch = { fullName: $('dv_name').value || undefined, phone: $('dv_phone').value || undefined, address: addressText };
          if(state.pendingGps){ patch.latitude = state.pendingGps.latitude; patch.longitude = state.pendingGps.longitude; }
          const pr = await fetch('/api/customers/me', {
            method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
            body: JSON.stringify(patch),
          });
          if(pr.ok) state.customer = await pr.json();
        }catch(e){}
      }

      const rows = cartEntries().map(e =>
        '<div class="receipt-meta"><span>'+escapeText(e.product.name)+' × '+e.qty+'</span><span>'+money(e.product.price*e.qty)+'</span></div>'
      ).join('');
      $('confirmBody').innerHTML =
        '<div class="receipt-meta"><span>'+escapeText(BIZ_NAME)+'</span><span>Order #'+String(order.id).slice(0,8).toUpperCase()+'</span></div>'
        + '<div class="receipt-meta"><span>'+new Date(order.createdAt||Date.now()).toLocaleString()+'</span><span></span></div>'
        + '<hr style="border:none;border-top:1px solid var(--paper);margin:8px 0;">'
        + rows
        + '<hr style="border:none;border-top:1px solid var(--paper);margin:8px 0;">'
        + '<div class="receipt-meta" style="font-weight:700;color:var(--ink);"><span>Total</span><span>'+money(order.total)+'</span></div>'
        + '<div class="receipt-meta"><span>Deliver to</span><span style="text-align:right;max-width:60%;">'+escapeText(addressText)+'</span></div>';

      cartEntries().forEach(e => { e.product.stock = Math.max(0, e.product.stock - e.qty); });
      state.cart = {}; state.pendingGps = null;
      renderGrid(); renderCartBar();
      placeBtn.disabled = false;
      fulfillMsg.textContent = '';
      showView('receiptView');
      setTimeout(() => { try{ window.print(); }catch(e){} }, 400);
    }catch(e){
      fulfillMsg.textContent = 'Network error — please try again.'; fulfillMsg.style.color = 'var(--err)';
      placeBtn.disabled = false;
    }
  });
  $('printReceiptBtn').addEventListener('click', () => window.print());
  $('trackOrderBtn').addEventListener('click', () => { showView('ordersView'); loadMyOrders(); });
  $('continueShoppingBtn').addEventListener('click', () => showView('shopView'));
  $('receiptBackBtn').addEventListener('click', () => showView('shopView'));

  $('accountBtn').addEventListener('click', () => {
    $('pf_name').value = (state.customer && state.customer.fullName) || '';
    $('pf_email').value = (state.customer && state.customer.email) || '';
    $('pf_phone').value = (state.customer && state.customer.phone) || '';
    $('pf_address').value = (state.customer && state.customer.address) || '';
    $('profileMsg').textContent = '';
    showView('profileView');
  });
  $('profileBackBtn').addEventListener('click', () => showView('shopView'));
  $('saveProfileBtn').addEventListener('click', async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const msg = $('profileMsg');
    msg.textContent = 'Saving…'; msg.style.color = 'var(--ink-soft)';
    try{
      const res = await fetch('/api/customers/me', {
        method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
        body: JSON.stringify({ fullName: $('pf_name').value, phone: $('pf_phone').value, address: $('pf_address').value }),
      });
      const data = await res.json();
      if(!res.ok){ msg.textContent = 'Could not save changes.'; msg.style.color = 'var(--err)'; return; }
      state.customer = data;
      msg.textContent = 'Saved ✓'; msg.style.color = 'var(--ok)';
    }catch(e){ msg.textContent = 'Network error — please try again.'; msg.style.color = 'var(--err)'; }
  });
  $('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    state.customer = null; state.cart = {};
    location.reload();
  });

  // ---- My orders (tracking real order status the store sets) ----
  $('myOrdersBtn').addEventListener('click', () => { showView('ordersView'); loadMyOrders(); });
  $('ordersBackBtn').addEventListener('click', () => showView('profileView'));
  const STATUS_LABEL = { PENDING:'Pending', CONFIRMED:'Confirmed', PREPARING:'Preparing', READY:'Ready for pickup/delivery', DELIVERED:'Delivered', CANCELLED:'Cancelled' };
  async function loadMyOrders(){
    const body = $('ordersPageBody');
    body.innerHTML = '<div class="orders-empty">Loading your orders…</div>';
    const token = localStorage.getItem(TOKEN_KEY);
    try{
      const res = await fetch('/api/shop/order/mine', { headers: { Authorization: 'Bearer ' + token } });
      const orders = await res.json();
      if(!res.ok || !Array.isArray(orders) || !orders.length){
        body.innerHTML = '<div class="orders-empty">You haven\u2019t placed any orders here yet.</div>';
        return;
      }
      body.innerHTML = orders.map(o => {
        const statusKey = (o.status || 'PENDING').toLowerCase();
        const itemsSummary = (o.items || []).map(i => escapeText(i.product ? i.product.name : 'Item') + ' × ' + i.quantity).join(', ');
        return '<div class="order-card">'
          + '<div class="order-card-head"><span class="oid">Order #'+String(o.id).slice(0,8).toUpperCase()+'</span><span class="odate">'+new Date(o.createdAt).toLocaleDateString()+'</span></div>'
          + '<span class="status-pill '+statusKey+'">'+(STATUS_LABEL[o.status] || 'Pending')+'</span>'
          + '<div class="oitems">'+itemsSummary+'</div>'
          + '<div class="ototal"><span>Total</span><span>'+money(o.total)+'</span></div>'
          + '</div>';
      }).join('');
    }catch(e){
      body.innerHTML = '<div class="orders-empty">Could not load your orders — please try again.</div>';
    }
  }

  (function initDraggableFab(){
    const fab = $('aiFabBtn');
    const POS_KEY = 'shop_ai_fab_pos_' + SLUG;
    try{
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if(saved){ fab.style.right = 'auto'; fab.style.bottom = 'auto'; fab.style.left = saved.left+'px'; fab.style.top = saved.top+'px'; }
    }catch(e){}
    let dragging = false, moved = false, offsetX = 0, offsetY = 0;
    function start(x, y){
      const r = fab.getBoundingClientRect();
      offsetX = x - r.left; offsetY = y - r.top;
      dragging = true; moved = false;
    }
    function move(x, y){
      if(!dragging) return;
      moved = true;
      let left = x - offsetX, top = y - offsetY;
      left = Math.max(4, Math.min(window.innerWidth - fab.offsetWidth - 4, left));
      top = Math.max(4, Math.min(window.innerHeight - fab.offsetHeight - 4, top));
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
      fab.style.left = left+'px'; fab.style.top = top+'px';
    }
    function end(){
      if(!dragging) return;
      dragging = false;
      if(moved){
        const r = fab.getBoundingClientRect();
        try{ localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top })); }catch(e){}
      }
    }
    fab.addEventListener('pointerdown', (e) => start(e.clientX, e.clientY));
    window.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('pointerup', end);
    fab.addEventListener('click', (e) => { if(moved){ e.preventDefault(); e.stopPropagation(); } });
  })();

  const aiState = { messages: [], busy: false };
  function aiMsgHtml(role, text){ return '<div class="ai-msg '+role+'">'+escapeText(text)+'</div>'; }
  function renderAiBody(){
    const body = $('aiPanelBody');
    if(aiState.messages.length === 0){
      body.innerHTML = aiMsgHtml('assistant', "Hi! I'm your shopping assistant for "+BIZ_NAME+". Ask me to add things to your cart, or tell me what you're cooking and I'll work out what you need from what's on the shelf.");
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
    btn.textContent = 'Added ✓'; btn.disabled = true;
  });
  $('aiFabBtn').addEventListener('click', () => { $('aiPanelOverlay').classList.add('open'); renderAiBody(); $('aiInputField').focus(); });
  $('closeAiPanel').addEventListener('click', () => $('aiPanelOverlay').classList.remove('open'));
  document.querySelectorAll('[data-ai-quick]').forEach(btn=> btn.addEventListener('click', () => sendAiMessage(btn.getAttribute('data-ai-quick'))));
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
    aiState.busy = true; renderAiBody();
    $('aiSendBtn').disabled = true; $('aiInputField').disabled = true;
    try{
      const res = await fetch('/api/shop/ai-assist', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ slug: SLUG, message: text, history: aiState.messages.slice(0,-1).slice(-10) }),
      });
      const data = await res.json();
      if(!res.ok){
        aiState.messages.push({ role:'assistant', text: data.error || "Sorry, I'm having trouble right now — please try again." });
      } else {
        (data.actions||[]).forEach(a => setQty(a.productId, (state.cart[a.productId]?.qty || 0) + a.qty));
        aiState.messages.push({ role:'assistant', text: data.reply || '', suggestions: data.suggestions || [] });
      }
    }catch(e){ aiState.messages.push({ role:'assistant', text: "Network error — please try again." }); }
    aiState.busy = false;
    $('aiSendBtn').disabled = false; $('aiInputField').disabled = false;
    renderAiBody(); $('aiInputField').focus();
  }
})();
</script>
</body>
</html>`);
});

module.exports = router;
