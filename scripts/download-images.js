// ============================================================
// تحميل صور الموقع مرة واحدة وحفظها جوه المشروع (assets/img)
// التشغيل:  npm run images
// - الصور اللي اتحمّلت قبل كده بيتخطاها.
// - لو صورة فشلت، بيكمل والموقع يعرض صورة بديلة مكانها.
// بعد ما يخلص: ارفع فولدر assets/img على GitHub مع باقي الملفات.
// ============================================================
const fs = require('fs');
const path = require('path');

const BASE = process.env.IMAGE_BASE || 'https://sspark.genspark.ai/i';
const OUT = path.join(__dirname, '..', 'assets', 'img');
const LIST = require('./images-list.json');
const EXT = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
const KNOWN = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'];

const exists = (id) => KNOWN.some((e) => fs.existsSync(path.join(OUT, id + e)));

async function fetchOne({ id, width }) {
  const url = `${BASE}/${id}?width=${width}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const ext = EXT[type];
      if (!ext) throw new Error('نوع غير متوقع: ' + type);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error('الملف صغير جداً');
      fs.writeFileSync(path.join(OUT, id + ext), buf);
      return { ok: true, size: buf.length };
    } catch (e) {
      if (attempt === 3) return { ok: false, error: e.message };
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let done = 0, skipped = 0, streak = 0; const failed = [];
  console.log(`🖼️  عدد الصور: ${LIST.length}`);
  for (const item of LIST) {
    if (exists(item.id)) { skipped++; continue; }
    const r = await fetchOne(item);
    if (r.ok) { streak = 0; done++; console.log(`  ✅ ${item.id} (${Math.round(r.size / 1024)} KB)`); }
    else {
      streak++; failed.push(item.id); console.log(`  ❌ ${item.id} — ${r.error}`);
      if (streak >= 3) { console.log('⛔ مصدر الصور مش متاح دلوقتي — وقفت المحاولة. جرّب تاني بعدين.'); failed.push(...LIST.filter((x) => !exists(x.id) && !failed.includes(x.id)).map((x) => x.id)); break; }
    }
  }
  console.log(`\nتم تحميل ${done} • موجودة من قبل ${skipped} • فشلت ${failed.length}`);
  if (failed.length) console.log('⚠️ الصور اللي فشلت هتظهر بصورة بديلة. شغّل الأمر تاني لإعادة المحاولة.');
  else console.log('🎉 كل الصور جوه المشروع دلوقتي — ارفع فولدر assets/img على GitHub.');
  if (process.argv.includes('--strict') && failed.length) process.exit(1);
})();
