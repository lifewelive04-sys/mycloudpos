const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// POST /api/shop/ai-assist
// Body: { slug: string, message: string, history?: [{role:'user'|'assistant', text:string}] }
// This is the secure replacement for calling api.anthropic.com directly from
// the browser. The key lives only here, in process.env.ANTHROPIC_API_KEY —
// never sent to the client.
router.post('/ai-assist', async (req, res) => {
  try {
    const { slug, message, history } = req.body || {};
    if (!slug || typeof slug !== 'string') return res.status(400).json({ error: 'slug is required' });
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI assistant is not configured on this server yet.' });
    }

    const business = await prisma.business.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!business) return res.status(404).json({ error: 'Store not found' });

    const products = await prisma.product.findMany({
      where: { businessId: business.id, inShop: true },
      select: { id: true, name: true, category: true, price: true, stock: true },
      orderBy: { name: 'asc' },
    });

    const catalog = products.length
      ? products.map((p) => `${p.id} | ${p.name} | ${p.category || 'Other'} | ${Number(p.price || 0).toFixed(2)} | stock:${p.stock || 0}`).join('\n')
      : '(no products currently listed in this store)';

    const sys = [
      `You are a friendly, concise shopping assistant embedded inside the online store "${business.name}".`,
      `You may ONLY recommend or add products that appear in the AVAILABLE PRODUCTS list below — never invent an item or a productId that isn't listed.`,
      ``,
      `AVAILABLE PRODUCTS (id | name | category | price | stock):`,
      catalog,
      ``,
      `Behaviors:`,
      `1. If the customer asks you to add specific items to their cart (e.g. "add 10 soaps and some eggs"), match each request to the closest product(s) in the list above and put them in "actions" so they get added automatically. If the requested quantity exceeds available stock, cap "qty" at the available stock and mention that in "reply". If nothing in the list matches a requested item, leave it out of "actions", say so in "reply", and add its plain name to "missing".`,
      `2. If the customer describes a dish or meal they want to prepare (e.g. "I want to make stew"), work out the ingredients that dish typically needs, then put every needed ingredient that IS available in the store into "suggestions" (do NOT put these in "actions" — the customer must tap to add each one). For any ingredient that is genuinely important for the dish but is NOT sold in this store, add its plain name to "missing" and briefly mention it in "reply" so the customer knows to source it elsewhere.`,
      `3. For general questions or small talk, just reply conversationally with empty actions/suggestions/missing.`,
      `4. Keep "reply" short and warm — 1 to 3 sentences.`,
      ``,
      `Respond with ONLY minified valid JSON, no markdown code fences, no commentary outside the JSON, in exactly this shape:`,
      `{"reply":"...","actions":[{"productId":"<id from list>","qty":<positive integer>}],"suggestions":[{"productId":"<id from list>","qty":<positive integer>}],"missing":["ingredient name", ...]}`,
      `Every productId you output MUST exactly match an id from the AVAILABLE PRODUCTS list above.`,
    ].join('\n');

    const safeHistory = Array.isArray(history)
      ? history.slice(-10).map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.text || '').slice(0, 2000),
        }))
      : [];
    const messages = [...safeHistory, { role: 'user', content: message.slice(0, 2000) }];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let apiRes;
    try {
      apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: sys,
          messages,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '');
      console.error('Anthropic API error:', apiRes.status, errText);
      return res.status(502).json({ error: 'AI assistant is temporarily unavailable.' });
    }

    const data = await apiRes.json();
    const text = (data.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('');
    let clean = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.json({ reply: text || "Sorry, I didn't quite catch that — could you rephrase?", actions: [], suggestions: [], missing: [] });
    }

    const validIds = new Set(products.map((p) => p.id));
    const cleanList = (list) =>
      Array.isArray(list)
        ? list
            .filter((a) => a && validIds.has(a.productId) && Number.isFinite(a.qty) && a.qty > 0)
            .map((a) => ({ productId: a.productId, qty: Math.floor(a.qty) }))
        : [];

    res.json({
      reply: typeof parsed.reply === 'string' ? parsed.reply.slice(0, 1000) : '',
      actions: cleanList(parsed.actions),
      suggestions: cleanList(parsed.suggestions),
      missing: Array.isArray(parsed.missing) ? parsed.missing.filter((m) => typeof m === 'string').slice(0, 20) : [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
