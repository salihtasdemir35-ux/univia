/* UNIVIA ortak sunucu – Cloudflare Worker (ücretsiz plan yeterli)
   Bağlamalar: KV namespace adı "UNIVIA"; ortam değişkeni (secret) "ADMIN_TOKEN" (moderasyon için).
   Uçlar:
     GET  /proxy?url=...                 → Haber/belediye sayfası veya RSS (CORS izni ekler, 10 dk önbellek)
     GET  /sources?locality=ID           → O yer için kullanıcıların eklediği bilgi kaynakları
     POST /sources                        → Kaynak ekle {locality,url,feedUrl,name,type,filter}
     GET  /contributions?locality=ID     → Yerel kullanıcı katkıları
     POST /contributions                  → Katkı ekle / güncelle
     POST /contributions/:id/(votes|sources|updates|reports|merge)  {loc,...}
     POST /moderation/:id  (Authorization: Bearer ADMIN_TOKEN)        {loc,action}
     POST /reports                        → Hatalı bilgi bildirimi
     GET  /places?lat=&lon=&radius=&lang=&types=a,b  → Google Places (New) yakındaki yerler. Gizli değişken: GOOGLE_PLACES_KEY. 1 gün KV önbellek. */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i;
const get = async (env, k) => JSON.parse((await env.UNIVIA.get(k)) || '[]');
const put = (env, k, v) => env.UNIVIA.put(k, JSON.stringify(v));
const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const ip = req.headers.get('CF-Connecting-IP') || 'x', rk = `rl:${ip}:${Math.floor(Date.now() / 60000)}`, n = +((await env.UNIVIA.get(rk)) || 0);
    if (n > 150) return json({ error: 'Çok fazla istek' }, 429);
    ctx.waitUntil(env.UNIVIA.put(rk, String(n + 1), { expirationTtl: 120 }));
    try {
      if (u.pathname === '/proxy') {
        let t; try { t = new URL(u.searchParams.get('url')); } catch { return json({ error: 'Geçersiz adres' }, 400); }
        if (!/^https?:$/.test(t.protocol) || PRIVATE.test(t.hostname)) return json({ error: 'İzin verilmeyen adres' }, 400);
        const post = req.method === 'POST', ck = new Request('https://cache.univia/' + encodeURIComponent(t.href)), cache = caches.default; let r = post ? null : await cache.match(ck);
        if (!r) { const up = await fetch(t.href, { method: post ? 'POST' : 'GET', body: post ? await req.text() : undefined, headers: { 'User-Agent': 'UNIVIA/1.0 (yerel bilgi rehberi)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.9, */*;q=0.5', ...(post ? { 'Content-Type': req.headers.get('Content-Type') || 'application/x-www-form-urlencoded' } : {}) }, redirect: 'follow' });
          const body = (await up.text()).slice(0, 2000000);
          r = new Response(body, { status: up.status, headers: { ...CORS, 'Content-Type': up.headers.get('Content-Type') || 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=600' } });
          if (up.ok && !post) ctx.waitUntil(cache.put(ck, r.clone())); }
        return r;
      }
      if (u.pathname === '/places') {
        if (!env.GOOGLE_PLACES_KEY) return json({ error: 'GOOGLE_PLACES_KEY tanımlı değil' }, 501);
        const lat = +u.searchParams.get('lat'), lon = +u.searchParams.get('lon'), radius = Math.min(5000, +u.searchParams.get('radius') || 1500), lang = (u.searchParams.get('lang') || 'tr').slice(0, 5);
        const types = (u.searchParams.get('types') || 'pharmacy').split(',').slice(0, 12).filter(x => /^[a-z_]+$/.test(x));
        const key = `gp:${lat.toFixed(3)},${lon.toFixed(3)}:${radius}:${lang}:${types.join(',')}`, hit = await env.UNIVIA.get(key); if (hit) return new Response(hit, { headers: { ...CORS, 'Content-Type': 'application/json' } });
        const groups = {};
        await Promise.all(types.map(async ty => { const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.formattedAddress,places.location,places.googleMapsUri' },
          body: JSON.stringify({ includedTypes: [ty], maxResultCount: 10, languageCode: lang, locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } } }) });
          const j = await r.json(); groups[ty] = (j.places || []).map(p => ({ name: p.displayName && p.displayName.text, rating: p.rating || null, count: p.userRatingCount || 0, open: p.currentOpeningHours ? p.currentOpeningHours.openNow : null,
            address: p.formattedAddress || '', lat: p.location && p.location.latitude, lon: p.location && p.location.longitude, mapsUrl: p.googleMapsUri })); }));
        const body = JSON.stringify({ groups, at: Date.now() }); ctx.waitUntil(env.UNIVIA.put(key, body, { expirationTtl: 86400 })); return new Response(body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const loc = u.searchParams.get('locality');
      if (u.pathname === '/sources') {
        if (req.method === 'GET') return json(loc ? await get(env, 'src:' + loc) : []);
        const b = await req.json(); if (!b.locality || !/^https?:\/\//.test(b.url || '')) return json({ error: 'Eksik bilgi' }, 400);
        const k = 'src:' + b.locality, arr = await get(env, k), ex = arr.find(s => s.url === b.url); if (ex) return json(ex);
        const s = { id: 's' + uid(), url: String(b.url).slice(0, 500), feedUrl: b.feedUrl ? String(b.feedUrl).slice(0, 500) : null, name: String(b.name || '').slice(0, 80), type: ['official', 'local_news', 'community', 'other'].includes(b.type) ? b.type : 'other', filter: String(b.filter || '').slice(0, 60), at: Date.now(), verified: false };
        arr.push(s); await put(env, k, arr.slice(-100)); return json(s);
      }
      if (u.pathname === '/contributions') {
        if (req.method === 'GET') return json(loc ? (await get(env, 'ct:' + loc)).filter(c => c.status === 'published') : []);
        const b = await req.json(); if (!b.loc || !b.id) return json({ error: 'Eksik bilgi' }, 400);
        const k = 'ct:' + b.loc, arr = await get(env, k);
        const c = { ...b, mine: undefined, authorId: undefined, reporterIds: undefined, photo: b.photo && b.photo.length < 450000 ? b.photo : null, author: b.anon ? 'Anonim' : String(b.author || 'Yerel katılımcı').slice(0, 30), status: b.status === 'published' ? 'published' : 'review' };
        const i = arr.findIndex(x => x.id === c.id); if (i >= 0) arr[i] = { ...arr[i], ...c }; else arr.push(c); await put(env, k, arr.slice(-500)); return json({ ok: true, id: c.id });
      }
      const m = u.pathname.match(/^\/contributions\/([\w-]+)\/(votes|sources|updates|reports|merge)$/);
      if (m && req.method === 'POST') {
        const b = await req.json(), k = 'ct:' + b.loc, arr = await get(env, k), c = arr.find(x => x.id === m[1]); if (!c) return json({ error: 'Bulunamadı' }, 404); const now = Date.now();
        if (m[2] === 'votes') { const vk = 'v:' + c.id, votes = JSON.parse((await env.UNIVIA.get(vk)) || '{}'); votes[b.by] = b.v; await env.UNIVIA.put(vk, JSON.stringify(votes)); const vs = Object.values(votes); c.up = vs.filter(v => v === 1).length; c.down = vs.filter(v => v === -1).length; }
        if (m[2] === 'sources') { (c.sources = c.sources || []).push({ type: b.type, url: b.url, note: String(b.note || '').slice(0, 140), at: now, verified: false }); c.updated = now; }
        if (m[2] === 'updates') { (c.history = c.history || []).push({ at: now, text: String(b.text || '').slice(0, 600), status: b.status, pending: !!b.pending }); if (!b.pending) c.updated = now; }
        if (m[2] === 'reports') { (c.reports = c.reports || []).push({ reason: b.reason, at: now }); c.risk = (c.risk || 0) + (+b.w || 1); if (c.risk >= 3) c.review = 'reported'; }
        if (m[2] === 'merge') { c.reporters = (c.reporters || 1) + 1; c.updated = now; (c.history = c.history || []).push({ at: now, text: 'Başka bir kullanıcı da bildirdi', status: 'ongoing' }); }
        await put(env, k, arr); return json({ ok: true });
      }
      const mm = u.pathname.match(/^\/moderation\/([\w-]+)$/);
      if (mm && req.method === 'POST') {
        if (req.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json({ error: 'Yetkisiz' }, 401);
        const b = await req.json(), k = 'ct:' + b.loc, arr = await get(env, k), c = arr.find(x => x.id === mm[1]); if (!c) return json({ error: 'Bulunamadı' }, 404);
        if (b.action === 'approve') c.status = 'published'; if (b.action === 'reject' || b.action === 'hide') c.status = 'rejected'; if (b.action === 'clear') { c.review = null; c.risk = 0; }
        if (b.action === 'verify') (c.sources || []).forEach(s => { if (s.type === 'official') s.verified = true; }); if (b.action === 'upd') (c.history || []).forEach(h => { h.pending = false; });
        await put(env, k, arr); return json({ ok: true });
      }
      if (u.pathname === '/reports' && req.method === 'POST') { const b = await req.json(), arr = await get(env, 'reports'); arr.push({ ...b, at: Date.now() }); await put(env, 'reports', arr.slice(-2000)); return json({ ok: true }); }
      return json({ error: 'Bulunamadı' }, 404);
    } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
  }
};
