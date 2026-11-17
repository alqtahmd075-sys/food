/* ============================================================
   STARS RESTAURANT — Shared app logic (API + cart + navbar)
   ============================================================ */
(function () {
  const API = (location.protocol.startsWith('http') && !location.protocol.includes('localhost') && location.hostname !== '127.0.0.1'
    ? '' : (location.origin.includes('localhost') || location.hostname === '127.0.0.1' ? '' : '')) + '/api';

  const token = () => localStorage.getItem('sf_token');
  const FALLBACK = 'assets/placeholder.svg';

  // نسخة ثابتة من بيانات المنيو والصواني والعروض (assets/data) — بتشتغل لو الموقع اترفع على GitHub Pages من غير سيرفر
  const STATIC_PATHS = ['/menu', '/menu/categories', '/trays', '/offers', '/reviews', '/images'];
  async function staticData(path) {
    const [base, qs] = path.split('?');
    const q = new URLSearchParams(qs || '');
    const r = await fetch('assets/data/' + base.replace(/^\//, '').replace(/\//g, '-') + '.json');
    if (!r.ok) throw new Error('خطأ ' + r.status);
    const d = await r.json();
    if (base === '/menu' && Array.isArray(d.data)) {
      let a = d.data;
      if (q.get('featured')) a = a.filter((x) => x.featured);
      if (q.get('category')) a = a.filter((x) => x.category === q.get('category'));
      return { ...d, data: a };
    }
    return d;
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    const canStatic = (opts.method || 'GET').toUpperCase() === 'GET' && STATIC_PATHS.includes(path.split('?')[0]);
    let r;
    try { r = await fetch('api' + path, { ...opts, headers }); }
    catch (e) { if (canStatic) return staticData(path); throw e; }
    if (canStatic && (r.status === 404 || r.status === 405 || r.status >= 500)) { try { return await staticData(path); } catch (_) {} }
    let d = {};
    try { d = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(d.message || 'خطأ ' + r.status);
    return d;
  }

  const fmt = (n) => Number(n || 0).toLocaleString('ar-EG') + ' ج.م';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  // امتداد كل صورة موجودة في assets/img — عشان الروابط تبقى مباشرة وبتشتغل على GitHub Pages من غير سيرفر
  const IMG_FILES = {"enmlJPPk81nSE9zW":".avif","7qmfBsmprwGVdAjt":".jpg","FZBwmx5QmOg3Ydnh":".avif","WQYisSNrHR0b9mBP":".jpg","1euWXOTlKPEklumC":".jpg","CdXi3kDib6fMBcpK":".avif","7cR5OS6o20HvBHXV":".jpg","QBUong5uHq2ImHcg":".jpg","MVWX2jwLWbSnkQ8x":".jpg","GfB8M68XIdiFMlMc":".jpg","0hyP9rejlO6LYKwt":".avif","mbh1mgnIUxf4xpBB":".jpg","HQ28omk0dfzddrA7":".avif","zmzkl8xWxhc6DK0B":".jpg","3fYIzYW9Y5pPaio8":".jpg","DRWiUMvJlJy4nvWS":".avif","1rvYkmtQWTT9kOmg":".jpg","m8pjRekKYf29HQMQ":".jpg","g8b6Qppkn6E64Saw":".avif","lOGfSq11TSOwJ50j":".avif","wMBHrKbeWSpN5YRQ":".jpg","JTD7S0oELlHsuUmm":".avif","F7Obo8fXauXeZskS":".avif","HbohWI5w5AbGcPAu":".jpg","YkZBVsAO0Z6u9Mh2":".jpg","nJslmLzWMCop7BSf":".jpg","YsdWmuuNWqHqnJJR":".jpg","LPkWQNdUHda6Rvxb":".jpg","68XCf2g9GsLYVz75":".jpg","OkrgtSuLeHo9MeYx":".jpg","shrimp-family-offer":".jpg","19I4VPwRIgvRdpbh":".jpg","8uUChCWJHM2Coa1i":".jpg","oa9cqyhA2F8e0QKW":".avif"};
  const img = (u) => {
    if (!u) return FALLBACK;
    const m = String(u).match(/^\/?assets\/img\/([A-Za-z0-9_-]+)(\.[a-z0-9]+)?$/i);
    if (!m) return u;
    if (IMG_FILES[m[1]]) return 'assets/img/' + m[1] + IMG_FILES[m[1]];
    return m[2] ? 'assets/img/' + m[1] + m[2] : FALLBACK;
  };

  window.SF = { api, fmt, esc, img, FALLBACK };

  /* ---------- Navbar active tab ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    document.querySelectorAll('.nav-tabs a').forEach((a) => {
      const href = a.getAttribute('href').replace('.html', '').replace('./', '');
      if (href === page || (page === 'index' && href === '/')) a.classList.add('active');
      else if (href === 'index' && page === 'index') a.classList.add('active');
    });
  });

  /* ---------- Cart ---------- */
  const cart = {
    get: () => JSON.parse(localStorage.getItem('sf_cart') || '[]'),
    set: (v) => { localStorage.setItem('sf_cart', JSON.stringify(v)); updateBadge(); },
    add: (type, id, name, price, image) => {
      const a = cart.get();
      const found = a.find((i) => i.type === type && i.id === id);
      if (found) found.qty += 1; else a.push({ type, id, name, price, image, qty: 1 });
      cart.set(a);
      toast(`تمت إضافة "${name}" للسلة 🛒`);
    },
    remove: (idx) => { const a = cart.get(); a.splice(idx, 1); cart.set(a); },
    clear: () => cart.set([]),
    count: () => cart.get().reduce((s, i) => s + i.qty, 0),
    total: () => cart.get().reduce((s, i) => s + i.price * i.qty, 0),
  };
  window.SFCart = cart;

  function updateBadge() {
    document.querySelectorAll('.cart-badge').forEach((b) => { b.textContent = cart.count(); });
  }
  document.addEventListener('DOMContentLoaded', updateBadge);

  function toast(msg) {
    let t = document.getElementById('sf-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sf-toast';
      t.style.cssText = 'position:fixed;bottom:24px;right:50%;transform:translateX(50%);background:#0a2647;color:#fff;padding:13px 26px;border-radius:999px;font-weight:700;z-index:999;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:.3s;opacity:0;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity = '0'; }, 2600);
  }

  /* ---------- HOME: featured + trays preview ---------- */
  window.sfHome = async function () {
    const g = document.getElementById('featuredGrid');
    if (g) {
      try {
        const r = await api('/menu?featured=1');
        g.innerHTML = r.data.map(dishCard).join('');
      } catch (e) { g.innerHTML = `<p style="text-align:center;color:var(--danger)">${esc(e.message)}</p>`; }
    }
    const op = document.getElementById('offersPreview');
    if (op) {
      try {
        const r = await api('/offers');
        op.innerHTML = r.data.slice(0, 3).map((o) => `<article class="card">
          <div class="card-media" style="aspect-ratio:16/9"><img loading="lazy" src="${esc(img(o.image))}" alt="" onerror="this.src=SF.FALLBACK"><span class="badge">خصم ${o.discount}%</span></div>
          <div class="card-body"><span class="tag">كود: ${esc(o.code)}</span><h3>${esc(o.title)}</h3><p class="desc">${esc(o.description)}</p>
          <a class="btn btn-dark" style="width:100%" href="order.html">اطلب بالعرض</a></div></article>`).join('');
      } catch (_) { op.innerHTML = ''; }
    }
    const rg = document.getElementById('reviewsGrid');
    if (rg) {
      try {
        const r = await api('/reviews');
        rg.innerHTML = r.data.map((rv) => `<article class="card" style="padding:22px">
          <div style="color:var(--gold);font-size:1.1rem;letter-spacing:2px">${'★'.repeat(rv.rating)}${'☆'.repeat(5 - rv.rating)}</div>
          <p style="margin:10px 0;color:var(--text)">"${esc(rv.text)}"</p>
          <b style="color:var(--primary)">— ${esc(rv.name)}</b></article>`).join('');
      } catch (_) { rg.innerHTML = ''; }
    }
    const tp = document.getElementById('traysPreview');
    if (tp) {
      try {
        const r = await api('/trays');
        tp.innerHTML = r.data.slice(0, 3).map(trayCard).join('');
      } catch (e) { tp.innerHTML = `<p style="text-align:center;color:var(--danger)">${esc(e.message)}</p>`; }
    }
    const gc = document.getElementById('galleryPreview');
    if (gc) gc.innerHTML = (await availableGallery()).slice(0, 8).map((u, i) => `<a href="gallery.html"><img loading="lazy" src="${img(u)}" alt="طبق ${i + 1}" onerror="this.src=SF.FALLBACK"></a>`).join('');
  };

  function dishCard(d) {
    return `<article class="card">
      <div class="card-media"><img loading="lazy" src="${esc(img(d.image))}" alt="${esc(d.name)}" onerror="this.src=SF.FALLBACK">${d.featured ? '<span class="badge">الأكثر طلباً</span>' : ''}</div>
      <div class="card-body">
        <span class="tag">${esc(d.category)}</span>
        <h3>${esc(d.name)}</h3>
        <p class="desc">${esc(d.description || '')}</p>
        <div class="price-row"><b>${fmt(d.price)}</b>${d.old_price ? `<s>${fmt(d.old_price)}</s>` : ''}</div>
        <button class="btn btn-dark" style="width:100%" onclick='SFCart.add("dish", ${d.id}, ${JSON.stringify(d.name)}, ${d.price}, ${JSON.stringify(d.image || '')})'><i class="fas fa-cart-plus"></i> أضف للسلة</button>
      </div></article>`;
  }
  window.sfDishCard = dishCard;

  function trayCard(t) {
    return `<article class="card">
      <div class="card-media"><img loading="lazy" src="${esc(img(t.image))}" alt="${esc(t.name)}" onerror="this.src=SF.FALLBACK"><span class="badge teal">${esc(t.serves || '')}</span></div>
      ${t.image_desc ? `<p class="img-cap"><i class="fas fa-camera"></i> ${esc(t.image_desc)}</p>` : ''}
      <div class="card-body">
        <span class="tag">صينية فاخرة</span>
        <h3>${esc(t.name)}</h3>
        <p class="desc">${esc(t.subtitle || '')} — تشمل: ${(t.items || []).slice(0, 4).map(esc).join('، ')}${(t.items || []).length > 4 ? '…' : ''}</p>
        <div class="price-row"><b>${fmt(t.price)}</b></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-dark" style="flex:1" onclick='SFCart.add("tray", ${t.id}, ${JSON.stringify(t.name)}, ${t.price}, ${JSON.stringify(t.image || '')})'><i class="fas fa-cart-plus"></i> أضف للسلة</button>
          <a class="btn btn-teal" href="trays.html" style="padding:13px 18px">التفاصيل</a>
        </div>
      </div></article>`;
  }
  window.sfTrayCard = trayCard;

  /* ---------- MENU page ---------- */
  window.sfMenu = async function () {
    const tabs = document.getElementById('menuTabs');
    const grid = document.getElementById('menuGrid');
    let all = [];
    async function loadAll() {
      const r = await api('/menu');
      all = r.data;
      const cats = [...new Set(all.map((d) => d.category))];
      tabs.innerHTML = `<button class="active" data-c="">الكل</button>` + cats.map((c) => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('');
      tabs.querySelectorAll('button').forEach((b) => b.onclick = () => {
        tabs.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        const c = b.getAttribute('data-c');
        const list = c ? all.filter((d) => d.category === c) : all;
        grid.innerHTML = list.map(dishCard).join('');
      });
      grid.innerHTML = all.map(dishCard).join('');
    }
    try { await loadAll(); } catch (e) { grid.innerHTML = `<p style="text-align:center;color:var(--danger)">${esc(e.message)}</p>`; }
  };

  /* ---------- TRAYS page ---------- */
  window.sfTrays = async function () {
    const grid = document.getElementById('traysGrid');
    try {
      const r = await api('/trays');
      grid.innerHTML = r.data.map((t) => `<article class="card" style="grid-column:span 1">
        <div class="card-media" style="aspect-ratio:16/9"><img loading="lazy" src="${esc(img(t.image))}" alt="${esc(t.name)}" onerror="this.src=SF.FALLBACK"><span class="badge">${esc(t.serves || '')}</span></div>
        ${t.image_desc ? `<p class="img-cap"><i class="fas fa-camera"></i> ${esc(t.image_desc)}</p>` : ''}
        <div class="card-body">
          <h3>${esc(t.name)}</h3>
          <p class="desc">${esc(t.subtitle || '')}</p>
          <ul style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.88rem;color:var(--muted);margin:8px 0">
            ${(t.items || []).map((i) => `<li><i class="fas fa-check" style="color:var(--teal)"></i> ${esc(i)}</li>`).join('')}
          </ul>
          <div class="price-row"><b style="font-size:1.5rem">${fmt(t.price)}</b></div>
          <button class="btn btn-dark" style="width:100%" onclick='SFCart.add("tray", ${t.id}, ${JSON.stringify(t.name)}, ${t.price}, ${JSON.stringify(t.image || '')})'><i class="fas fa-cart-plus"></i> اطلب الصينية</button>
        </div></article>`).join('');
    } catch (e) { grid.innerHTML = `<p style="text-align:center;color:var(--danger)">${esc(e.message)}</p>`; }
  };

  /* ---------- ORDER page (cart + checkout + track) ---------- */
  const PAY_METHODS = [
    { id: 'VODAFONE_CASH', label: 'فودافون كاش', icon: 'fa-mobile-screen', info: 'حوّل على رقم 0120202003 وأرسل صورة التحويل واتساب.' },
    { id: 'VISA', label: 'فيزا / ماستركارد (عند الاستلام)', icon: 'fa-credit-card', info: 'الدفع بالفيزا أو الماستركارد بيتم عند الاستلام عن طريق ماكينة الدفع مع المندوب.' },
    { id: 'CASH', label: 'دفع عند الاستلام', icon: 'fa-money-bill-wave', info: 'ادفع نقداً للمندوب عند وصول الطلب.' },
  ];
  let selectedPay = 'VODAFONE_CASH';

  window.sfOrder = async function () {
    renderCart();
    const pays = document.getElementById('payOptions');
    if (pays) {
      pays.innerHTML = PAY_METHODS.map((p) => `<div class="pay-option ${p.id === selectedPay ? 'selected' : ''}" data-p="${p.id}">
        <div class="pi"><i class="fas ${p.icon}"></i></div>
        <div><b>${p.label}</b><div style="font-size:.8rem;color:var(--muted)">${p.info}</div></div></div>`).join('');
      pays.querySelectorAll('.pay-option').forEach((el) => el.onclick = () => {
        selectedPay = el.getAttribute('data-p');
        pays.querySelectorAll('.pay-option').forEach((x) => x.classList.toggle('selected', x === el));
      });
    }
    const btn = document.getElementById('submitOrder');
    if (btn) btn.onclick = submitOrder;
    const tb = document.getElementById('trackBtn');
    if (tb) tb.onclick = trackOrder;
  };

  function renderCart() {
    const box = document.getElementById('cartBox');
    if (!box) return;
    const items = cart.get();
    if (!items.length) {
      box.innerHTML = `<div class="alert err" style="display:block">سلتك فاضية — <a href="menu.html" style="text-decoration:underline">تصفح المنيو</a> أو <a href="trays.html" style="text-decoration:underline">شوف الصواني</a></div>`;
    } else {
      box.innerHTML = items.map((i, idx) => `<div class="cart-item">
        <img src="${esc(img(i.image))}" onerror="this.src=SF.FALLBACK" alt="">
        <div class="ci-info"><b>${esc(i.name)}</b><span class="muted">الكمية: ${i.qty} × ${fmt(i.price)}</span></div>
        <b style="color:var(--primary)">${fmt(i.price * i.qty)}</b>
        <button class="btn-ghost" style="background:none;color:var(--danger);font-weight:800" onclick="SFRemove(${idx})">✕</button>
      </div>`).join('') + `<div class="summary-row total" style="margin-top:14px"><span>الإجمالي</span><b>${fmt(cart.total())}</b></div>`;
    }
  }
  window.SFRemove = (idx) => { cart.remove(idx); renderCart(); };

  async function submitOrder() {
    const err = document.getElementById('orderErr');
    const ok = document.getElementById('orderOk');
    err.style.display = 'none'; ok.style.display = 'none';
    const name = document.getElementById('o_name').value.trim();
    const phone = document.getElementById('o_phone').value.trim();
    const address = document.getElementById('o_address').value.trim();
    if (!name || !phone || !address) { err.textContent = 'أدخل الاسم ورقم الهاتف والعنوان'; err.style.display = 'block'; return; }
    const items = cart.get().map((i) => ({ type: i.type, id: i.id, qty: i.qty }));
    try {
      const r = await api('/orders', { method: 'POST', body: JSON.stringify({
        customer: { name, phone, email: document.getElementById('o_email').value.trim(), address },
        notes: document.getElementById('o_notes').value.trim(),
        items, paymentMethod: selectedPay,
      }) });
      cart.clear();
      const o = r.data;
      ok.style.display = 'block';
      ok.innerHTML = `✅ تم استلام طلبك بنجاح!<br>رقم الطلب: <b style="font-size:1.3rem;direction:ltr;display:inline-block">${esc(o.order_number)}</b> — الإجمالي: <b>${fmt(o.total)}</b><br><small>احفظ رقم الطلب لتتبعه من القسم اللي تحت 👇</small>`;
      ok.scrollIntoView({ behavior: 'smooth' });
      renderCart();
    } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  }

  async function trackOrder() {
    const res = document.getElementById('trackRes');
    const num = document.getElementById('trackNo').value.trim();
    if (!num) return;
    res.innerHTML = '<p style="color:var(--muted)">جاري البحث…</p>';
    try {
      const r = await api('/orders/track/' + encodeURIComponent(num));
      const o = r.data;
      res.innerHTML = `<div class="track-box" style="margin-top:16px">
        <div class="summary-row"><span>رقم الطلب</span><b style="direction:ltr">${esc(o.order_number)}</b></div>
        <div class="summary-row"><span>حالة الطلب</span><b><span class="status-pill ${esc(o.order_status)}">${statusAr(o.order_status)}</span></b></div>
        <div class="summary-row"><span>حالة الدفع</span><b>${payAr(o.payment_status)}</b></div>
        <div class="summary-row"><span>الأصناف</span><b>${o.items.map((i) => esc(i.name) + ' ×' + i.qty).join('، ')}</b></div>
        <div class="summary-row total"><span>الإجمالي</span><b>${fmt(o.total)}</b></div>
      </div>`;
    } catch (e) { res.innerHTML = `<p style="color:var(--danger);margin-top:10px">${esc(e.message)}</p>`; }
  }
  function statusAr(s) { return { PENDING: 'قيد المراجعة', CONFIRMED: 'تم التأكيد', PROCESSING: 'جاري التحضير', COMPLETED: 'تم التسليم', CANCELLED: 'ملغي' }[s] || s; }
  function payAr(s) { return { PENDING: 'لم يتم الدفع بعد', PAID: 'مدفوع ✅', REFUNDED: 'تم الإرجاع' }[s] || s; }

  /* ---------- CONTACT page ---------- */
  window.sfContact = function () {
    const btn = document.getElementById('contactBtn');
    if (!btn) return;
    btn.onclick = async () => {
      const err = document.getElementById('contactErr');
      const ok = document.getElementById('contactOk');
      err.style.display = 'none'; ok.style.display = 'none';
      const name = document.getElementById('c_name').value.trim();
      const message = document.getElementById('c_msg').value.trim();
      if (!name || message.length < 5) { err.textContent = 'أدخل الاسم ورسالة لا تقل عن 5 أحرف'; err.style.display = 'block'; return; }
      try {
        const r = await api('/contact', { method: 'POST', body: JSON.stringify({
          name, email: document.getElementById('c_email').value.trim(), phone: document.getElementById('c_phone').value.trim(), message,
        }) });
        ok.textContent = r.message; ok.style.display = 'block';
        ['c_name', 'c_email', 'c_phone', 'c_msg'].forEach((id) => document.getElementById(id).value = '');
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    };
  };

  /* ---------- GALLERY ---------- */
  const GALLERY = [
    '/assets/img/YsdWmuuNWqHqnJJR',
    '/assets/img/68XCf2g9GsLYVz75',
    '/assets/img/7qmfBsmprwGVdAjt',
    '/assets/img/1euWXOTlKPEklumC',
    '/assets/img/m8pjRekKYf29HQMQ',
    '/assets/img/19I4VPwRIgvRdpbh',
    '/assets/img/HQ28omk0dfzddrA7',
    '/assets/img/CdXi3kDib6fMBcpK',
    '/assets/img/0hyP9rejlO6LYKwt',
    '/assets/img/LPkWQNdUHda6Rvxb',
    '/assets/img/1rvYkmtQWTT9kOmg',
    '/assets/img/wMBHrKbeWSpN5YRQ',
    '/assets/img/YkZBVsAO0Z6u9Mh2',
    '/assets/img/7cR5OS6o20HvBHXV',
    '/assets/img/GfB8M68XIdiFMlMc',
    '/assets/img/WQYisSNrHR0b9mBP',
    '/assets/img/3fYIzYW9Y5pPaio8',
    '/assets/img/nJslmLzWMCop7BSf',
    '/assets/img/enmlJPPk81nSE9zW',
    '/assets/img/FZBwmx5QmOg3Ydnh',
    '/assets/img/mbh1mgnIUxf4xpBB',
    '/assets/img/DRWiUMvJlJy4nvWS',
    '/assets/img/g8b6Qppkn6E64Saw',
    '/assets/img/HbohWI5w5AbGcPAu',
    '/assets/img/lOGfSq11TSOwJ50j',
    '/assets/img/MVWX2jwLWbSnkQ8x',
    '/assets/img/8uUChCWJHM2Coa1i',
    '/assets/img/F7Obo8fXauXeZskS',
    '/assets/img/OkrgtSuLeHo9MeYx',
    '/assets/img/zmzkl8xWxhc6DK0B',
    '/assets/img/QBUong5uHq2ImHcg',
    '/assets/img/JTD7S0oELlHsuUmm',
    '/assets/img/oa9cqyhA2F8e0QKW',
  ];
  window.SFGALLERY = GALLERY;
  // المعرض بيعرض الصور الموجودة فعلاً بس (من غير نجوم بديلة)
  const availableGallery = async () => {
    try {
      const r = await api('/images');
      const have = new Set(r.data);
      const list = GALLERY.filter((u) => have.has(u.split('/').pop()));
      return list.length ? list : GALLERY;
    } catch (_) { return GALLERY; }
  };

  window.sfGallery = async function () {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const GAL = await availableGallery();
    grid.innerHTML = GAL.map((u, i) => `<a href="${img(u)}" data-lightbox><img loading="lazy" src="${img(u)}" alt="صورة ${i + 1}" onerror="this.src=SF.FALLBACK"></a>`).join('');
    const lb = document.getElementById('sfLightbox');
    const lbImg = document.getElementById('sfLightboxImg');
    grid.querySelectorAll('[data-lightbox]').forEach((a) => a.onclick = (e) => {
      e.preventDefault();
      lbImg.src = a.getAttribute('href');
      lb.classList.add('active');
    });
    lb.onclick = () => lb.classList.remove('active');
  };

  /* ---------- OFFERS page ---------- */
  window.sfOffers = async function () {
    const grid = document.getElementById('offersGrid');
    if (!grid) return;
    try {
      const r = await api('/offers');
      grid.innerHTML = r.data.map((o) => `<article class="card">
        <div class="card-media" style="aspect-ratio:16/9"><img loading="lazy" src="${esc(img(o.image))}" alt="" onerror="this.src=SF.FALLBACK"><span class="badge">خصم ${o.discount}%</span></div>
        <div class="card-body">
          <span class="tag">كود الخصم: ${esc(o.code)}</span>
          <h3>${esc(o.title)}</h3>
          <p class="desc">${esc(o.description)}</p>
          <a class="btn btn-dark" style="width:100%" href="order.html"><i class="fas fa-bolt"></i> اطلب بالعرض</a>
        </div></article>`).join('');
    } catch (e) { grid.innerHTML = `<p style="text-align:center;color:var(--danger)">${esc(e.message)}</p>`; }
  };

  /* ---------- RESERVATIONS page ---------- */
  window.sfReserve = function () {
    const btn = document.getElementById('reserveBtn');
    if (!btn) return;
    btn.onclick = async () => {
      const err = document.getElementById('resErr');
      const ok = document.getElementById('resOk');
      err.style.display = 'none'; ok.style.display = 'none';
      const name = document.getElementById('r_name').value.trim();
      const phone = document.getElementById('r_phone').value.trim();
      const date = document.getElementById('r_date').value;
      const time = document.getElementById('r_time').value;
      if (!name || !phone || !date || !time) { err.textContent = 'أدخل الاسم والهاتف والتاريخ والوقت'; err.style.display = 'block'; return; }
      try {
        const r = await api('/reservations', { method: 'POST', body: JSON.stringify({
          name, phone, guests: document.getElementById('r_guests').value, date, time, notes: document.getElementById('r_notes').value.trim(),
        }) });
        ok.textContent = r.message; ok.style.display = 'block';
        err.style.display = 'none';
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    };
  };

  /* ---------- ADMIN ---------- */
  window.sfAdmin = function () {
    const $ = (id) => document.getElementById(id);
    function showPage(page) {
      ['login', 'dash'].forEach((p) => $(p === 'login' ? 'adminLogin' : 'adminDash').style.display = p === page ? 'block' : 'none');
    }
    async function tryBoot() {
      if (!token()) { showPage('login'); return; }
      try { await api('/admin/dashboard'); showPage('dash'); loadAll(); }
      catch (_) { localStorage.removeItem('sf_token'); showPage('login'); }
    }
    $('adminLoginBtn').onclick = async () => {
      $('adminErr').textContent = '';
      try {
        await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('a_email').value.trim(), password: $('a_pass').value }) });
        showPage('dash'); loadAll();
      } catch (e) { $('adminErr').textContent = e.message; }
    };
    $('adminLogout').onclick = () => { localStorage.removeItem('sf_token'); showPage('login'); };
    document.querySelectorAll('.admin-side a[data-tab]').forEach((a) => a.onclick = (e) => {
      e.preventDefault();
      document.querySelectorAll('.admin-side a[data-tab]').forEach((x) => x.classList.remove('active'));
      a.classList.add('active');
      ['overview', 'orders', 'menu', 'reservations', 'messages'].forEach((t) => $('tab-' + t).style.display = t === a.dataset.tab ? 'block' : 'none');
      $('tabTitle').textContent = a.textContent.trim();
    });

    async function loadAll() { loadDash(); loadOrders(); loadMenu(); loadMsgs(); loadReservations(); }

    async function loadDash() {
      try {
        const r = await api('/admin/dashboard');
        const d = r.data;
        $('dashStats').innerHTML = [
          ['أطباق المنيو', d.dishes], ['الصواني', d.trays], ['إجمالي الطلبات', d.totalOrders],
          ['قيد المراجعة', d.pendingOrders], ['مكتملة', d.completedOrders], ['الإيرادات', fmt(d.revenue)], ['رسائل جديدة', d.newMessages],
        ].map(([l, v]) => `<div class="stat-card"><b>${v}</b><span>${l}</span></div>`).join('');
      } catch (e) { $('dashStats').innerHTML = `<p style="color:var(--danger)">${esc(e.message)}</p>`; }
    }

    async function loadOrders() {
      try {
        const r = await api('/admin/orders');
        $('ordersBody').innerHTML = r.data.map((o) => `<tr>
          <td style="direction:ltr">${esc(o.order_number)}</td>
          <td>${esc(o.customer_name)}<br><small style="color:var(--muted)">${esc(o.phone)}</small></td>
          <td>${o.items.map((i) => esc(i.name) + ' ×' + i.qty).join('<br>')}</td>
          <td><b>${fmt(o.total)}</b></td>
          <td>${esc(o.payment_method)}</td>
          <td><select class="status" onchange="SFSetOrder(${o.id}, this.value)">
            ${['PENDING','CONFIRMED','PROCESSING','COMPLETED','CANCELLED'].map((s) => `<option ${s === o.order_status ? 'selected' : ''}>${s}</option>`).join('')}
          </select></td></tr>`).join('');
      } catch (e) { $('ordersBody').innerHTML = `<tr><td colspan="6" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
    }
    window.SFSetOrder = async (id, s) => { if (!s) return; await api('/admin/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ orderStatus: s }) }); loadOrders(); loadDash(); };

    async function loadMenu() {
      try {
        const r = await api('/admin/menu');
        $('menuBody').innerHTML = r.data.map((d) => `<tr>
          <td><img src="${esc(img(d.image))}" style="width:60px;height:44px;object-fit:cover;border-radius:8px" onerror="this.src=SF.FALLBACK"></td>
          <td>${esc(d.name)}</td><td>${esc(d.category)}</td><td><b>${fmt(d.price)}</b></td>
          <td>${d.available ? '✅' : '⛔'}</td>
          <td><button class="btn" style="padding:7px 16px;font-size:.8rem;background:var(--danger)" onclick="SFDelDish(${d.id})">حذف</button></td></tr>`).join('');
      } catch (e) { $('menuBody').innerHTML = `<tr><td colspan="6" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
    }
    window.SFDelDish = async (id) => { if (!confirm('حذف الطبق؟')) return; await api('/admin/menu/' + id, { method: 'DELETE' }); loadMenu(); loadDash(); };

    async function loadMsgs() {
      try {
        const r = await api('/admin/messages');
        $('msgsBody').innerHTML = r.data.map((m) => `<tr>
          <td>${esc(m.name)}</td><td>${esc(m.email || '-')}<br><small>${esc(m.phone || '')}</small></td>
          <td>${esc((m.message || '').slice(0, 100))}</td><td>${esc(m.status)}</td></tr>`).join('') || '<tr><td colspan="4">لا توجد رسائل بعد</td></tr>';
      } catch (e) { $('msgsBody').innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
    }

    async function loadReservations() {
      try {
        const r = await api('/admin/reservations');
        $('resBody').innerHTML = r.data.map((rv) => `<tr>
          <td>${esc(rv.name)}</td><td style="direction:ltr">${esc(rv.phone)}</td>
          <td>${rv.guests}</td><td style="direction:ltr">${esc(rv.date)} ${esc(rv.time)}</td>
          <td>${esc(rv.notes || '-')}</td>
          <td><select class="status" onchange="SFSetRes(${rv.id}, this.value)">
            ${['PENDING','CONFIRMED','CANCELLED'].map((s) => `<option ${s === rv.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select></td></tr>`).join('') || '<tr><td colspan="6">لا توجد حجوزات بعد</td></tr>';
      } catch (e) { $('resBody').innerHTML = `<tr><td colspan="6" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
    }
    window.SFSetRes = async (id, s) => { if (!s) return; await api('/admin/reservations/' + id, { method: 'PUT', body: JSON.stringify({ status: s }) }); loadReservations(); };

    tryBoot();
  };
})();
