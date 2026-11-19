/* مشاهد الصور + تفاصيل المنتج — تنقل يمين/شمال، أسهم الكيبورد، سحب باللمس */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  let root, items = [], idx = 0, mode = 'image', lastFocus = null;

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'sfv';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML = `
      <button class="sfv-close" type="button" aria-label="إغلاق"><i class="fas fa-xmark"></i></button>
      <button class="sfv-nav sfv-prev" type="button" aria-label="السابق"><i class="fas fa-chevron-right"></i></button>
      <button class="sfv-nav sfv-next" type="button" aria-label="التالي"><i class="fas fa-chevron-left"></i></button>
      <div class="sfv-body">
        <figure class="sfv-stage"><img alt=""><figcaption></figcaption></figure>
        <aside class="sfv-info"></aside>
      </div>
      <div class="sfv-count"></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target.classList.contains('sfv-body') || e.target.closest('.sfv-close')) close();
      else if (e.target.closest('.sfv-prev')) go(-1);
      else if (e.target.closest('.sfv-next')) go(1);
      else if (e.target.closest('[data-sfv-add]')) {
        const it = items[idx];
        if (it && it.add && window.SFCart) window.SFCart.add(it.add.kind, it.add.id, it.add.name, it.add.price, it.add.image);
      }
    });
    let x0 = null;
    root.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); // سحب لليسار = التالي (RTL)
    }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (root.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(1);
      else if (e.key === 'ArrowRight') go(-1);
    });
  }

  function render() {
    const it = items[idx]; if (!it) return;
    const img = root.querySelector('.sfv-stage img');
    img.classList.remove('in'); img.src = it.src; img.alt = it.alt || '';
    requestAnimationFrame(() => img.classList.add('in'));
    root.querySelector('figcaption').textContent = mode === 'image' ? (it.alt || '') : '';
    root.querySelector('.sfv-count').textContent = (idx + 1) + ' / ' + items.length;
    root.classList.toggle('sfv-product', mode === 'product');
    root.querySelector('.sfv-info').innerHTML = mode === 'product' ? it.html : '';
    root.querySelectorAll('.sfv-nav').forEach((b) => { b.style.display = items.length > 1 ? '' : 'none'; });
    // تحميل مسبق للصورتين المجاورتين
    [1, -1].forEach((d) => { const n = items[(idx + d + items.length) % items.length]; if (n) new Image().src = n.src; });
  }

  function go(d) { if (items.length < 2) return; idx = (idx + d + items.length) % items.length; render(); }

  function open(list, i, m) {
    build(); items = list; idx = i; mode = m;
    lastFocus = document.activeElement;
    root.hidden = false; document.body.classList.add('sfv-open');
    render(); root.querySelector('.sfv-close').focus();
  }
  function close() { if (!root || root.hidden) return; root.hidden = true; document.body.classList.remove('sfv-open'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  const fmt = (n) => (window.SF ? window.SF.fmt(n) : n);
  const imgUrl = (u) => (window.SF ? window.SF.img(u) : u);

  function productItem(key) {
    const o = window.SF && window.SF.REG[key]; if (!o) return null;
    const kind = key.split(':')[0];
    const rows = [];
    if (kind === 'dish') {
      if (o.category) rows.push(['التصنيف', o.category]);
      rows.push(['التوفر', o.available === 0 ? 'غير متاح حالياً' : 'متاح للطلب']);
    } else {
      if (o.serves) rows.push(['تكفي', o.serves.replace(/^تكفي\s*/, '')]);
      rows.push(['التوفر', o.available === 0 ? 'غير متاح حالياً' : 'متاح للطلب']);
    }
    const html = `
      ${o.featured ? '<span class="sfv-badge">الأكثر طلباً</span>' : ''}
      <h2>${esc(o.name)}</h2>
      ${o.subtitle ? `<p class="sfv-sub">${esc(o.subtitle)}</p>` : ''}
      <div class="sfv-price"><b>${fmt(o.price)}</b>${o.old_price ? `<s>${fmt(o.old_price)}</s>` : ''}</div>
      ${o.description ? `<p class="sfv-desc">${esc(o.description)}</p>` : ''}
      ${o.image_desc ? `<p class="sfv-desc"><i class="fas fa-camera"></i> ${esc(o.image_desc)}</p>` : ''}
      <dl class="sfv-rows">${rows.map((r) => `<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl>
      ${(o.items && o.items.length) ? `<h3>محتويات الصينية</h3><ul class="sfv-list">${o.items.map((i) => `<li><i class="fas fa-check"></i> ${esc(i)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="btn btn-dark sfv-add" data-sfv-add><i class="fas fa-cart-plus"></i> أضف للسلة</button>`;
    return { src: imgUrl(o.image), alt: o.name, html, add: { kind, id: o.id, name: o.name, price: o.price, image: o.image || '' } };
  }

  document.addEventListener('click', (e) => {
    // زر التفاصيل
    const db = e.target.closest('[data-details]');
    if (db) {
      e.preventDefault();
      const grid = db.closest('.card') ? db.closest('.card').parentElement : document;
      const keys = [...grid.querySelectorAll('[data-details]')].map((b) => b.getAttribute('data-details'));
      const list = []; let start = 0;
      keys.forEach((k) => { const it = productItem(k); if (it) { if (k === db.getAttribute('data-details')) start = list.length; list.push(it); } });
      if (list.length) open(list, start, 'product');
      return;
    }
    // الضغط على أي صورة (كارت أو معرض أو عرض)
    const im = e.target.closest('.card-media img, [data-lightbox] img, .card-media');
    if (im) {
      const media = im.closest('.card-media') || im.closest('[data-lightbox]');
      const target = media && media.querySelector('img'); if (!target) return;
      const scope = (media.closest('.card') ? media.closest('.card').parentElement : media.parentElement) || document;
      const imgs = [...scope.querySelectorAll('.card-media img, [data-lightbox] img')];
      const list = imgs.map((i) => ({ src: i.currentSrc || i.src, alt: i.alt || '' }));
      const start = Math.max(0, imgs.indexOf(target));
      e.preventDefault();
      open(list, start, 'image');
    }
  });
})();
