// ============================================================
// STARS RESTAURANT — مطعم النجوم — Main Server (Node >= 22)
// ============================================================
const express = require('express');
require('express-async-errors');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { db, initDB, PERSISTENT, MODE, DB_LABEL } = require('./server/config/database');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// static frontend — بنقدّم الصفحات والـ assets بس (مش كل الفولدر: عشان قاعدة البيانات والكود ما يتحمّلوش)
const PAGES = ['index','menu','trays','offers','gallery','reservations','order','faq','contact','admin'];
// الصور: /assets/img/<id> بيدوّر على الملف المحلي (jpg/png/webp...)، ولو مش موجود بيرجّع صورة بديلة بدل ما تبقى مكسورة
const IMG_DIR = path.join(__dirname, 'assets', 'img');
const IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg'];
const IMG_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
app.get('/assets/img/:id', (req, res, next) => {
  const id = String(req.params.id).replace(/\.[a-z0-9]+$/i, '');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return next();
  for (const ext of IMG_EXT) {
    const f = path.join(IMG_DIR, id + ext);
    if (fs.existsSync(f)) return res.sendFile(f, { maxAge: '7d', headers: { 'Content-Type': IMG_MIME[ext] } });
  }
  res.sendFile(path.join(__dirname, 'assets', 'placeholder.svg'), { headers: { 'Cache-Control': 'no-cache' } });
});
// قائمة الصور الموجودة فعلاً (المعرض بيعرض الصور الحقيقية بس)
app.get('/api/images', (_req, res) => {
  let ids = [];
  try { ids = fs.readdirSync(IMG_DIR).filter((f) => IMG_EXT.includes(path.extname(f).toLowerCase())).map((f) => f.replace(/\.[a-z0-9]+$/i, '')); } catch (_) {}
  res.json({ success: true, data: ids });
});
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '1d' }));
app.get('/', async (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get(/^\/([a-z]+)(?:\.html)?$/, (req, res, next) => {
  if (!PAGES.includes(req.params[0])) return next();
  res.sendFile(path.join(__dirname, req.params[0] + '.html'));
});


// ---------------- helpers ----------------
// المكونات بتتخزن JSON في عمود نصي — بنرجّعها للواجهة كمصفوفة
const parseList = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const normList = (v) => (Array.isArray(v) ? v : String(v || '').split(/\r?\n|،|,/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
const dishOut = (r) => (r ? { ...r, ingredients: parseList(r.ingredients) } : r);
const sign = (user) => jwt.sign({ id: user.id, role: user.role || 'USER' }, JWT_SECRET, { expiresIn: '7d' });
const pubUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'USER' });
function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) { try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch (_) {} }
  next();
}
app.use('/api', authOptional);
async function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'غير مصرح — سجل دخول أولاً' });
  const row = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (!row || row.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'صلاحيات أدمن مطلوبة' });
  next();
}
const orderNumber = () => 'ST-' + Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString().slice(-4);

// ---------------- AUTH ----------------
// حد محاولات تسجيل الدخول: 8 محاولات كل 15 دقيقة لكل IP
const loginHits = new Map();
function loginLimiter(req, res, next) {
  const now = Date.now(), key = req.ip, WINDOW = 15 * 60 * 1000;
  const rec = (loginHits.get(key) || []).filter((t) => now - t < WINDOW);
  if (rec.length >= 8) return res.status(429).json({ success: false, message: 'محاولات كتير — جرّب بعد 15 دقيقة' });
  rec.push(now); loginHits.set(key, rec);
  next();
}
setInterval(() => loginHits.clear(), 60 * 60 * 1000).unref();

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.password) return res.status(401).json({ success: false, message: 'البريد أو كلمة المرور غير صحيحة' });
  if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false, message: 'البريد أو كلمة المرور غير صحيحة' });
  res.json({ success: true, token: sign(user), user: pubUser(user) });
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'أدخل جميع البيانات' });
  try {
    const r = await db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'USER')`).run(name, email, bcrypt.hashSync(password, 10));
    const user = { id: r.lastInsertRowid, name, email, role: 'USER' };
    res.status(201).json({ success: true, token: sign(user), user: pubUser(user) });
  } catch (_) { res.status(400).json({ success: false, message: 'هذا البريد مسجل بالفعل' }); }
});

// ---------------- MENU ----------------
app.get('/api/menu', async (req, res) => {
  const { category = '', featured = '' } = req.query;
  let sql = 'SELECT * FROM menu_items WHERE available = 1';
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (featured) sql += ' AND featured = 1';
  sql += ' ORDER BY featured DESC, id ASC';
  res.json({ success: true, data: (await db.prepare(sql).all(...p)).map(dishOut) });
});

app.get('/api/menu/categories', async (_req, res) => {
  res.json({ success: true, data: await db.prepare('SELECT category, COUNT(*) AS count FROM menu_items GROUP BY category ORDER BY id').all() });
});

// ---------------- TRAYS ----------------
app.get('/api/trays', async (_req, res) => {
  const rows = await db.prepare('SELECT * FROM trays WHERE available = 1 ORDER BY price ASC').all();
  res.json({ success: true, data: rows.map((t) => ({ ...t, items: JSON.parse(t.items || '[]') })) });
});

// ---------------- ORDERS ----------------
const PAY_METHODS = { CASH: 'الدفع عند الاستلام', VODAFONE_CASH: 'فودافون كاش 01202022003 / 01021946722', VISA: 'فيزا / ماستركارد عند الاستلام (ماكينة POS)' };

app.post('/api/orders', async (req, res) => {
  const { customer = {}, items = [], paymentMethod = 'CASH', notes } = req.body || {};
  if (!customer.name || !customer.phone) return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'السلة فاضية — اختر أطباقك أولاً' });

  let total = 0;
  const fullItems = [];
  for (const it of items) {
    const qty = Math.min(50, Math.max(1, Math.floor(Number(it.qty)) || 1));
    let row = null;
    if (it.type === 'tray') row = await db.prepare('SELECT * FROM trays WHERE id = ?').get(it.id);
    else row = await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(it.id);
    if (!row) return res.status(404).json({ success: false, message: 'أحد الأصناف المطلوبة غير موجود' });
    const price = Number(row.price);
    total += price * qty;
    fullItems.push({ type: it.type, id: row.id, name: row.name, price, qty });
  }
  if (!PAY_METHODS[paymentMethod]) return res.status(400).json({ success: false, message: 'طريقة دفع غير معروفة' });

  const num = orderNumber();
  await db.prepare(`INSERT INTO orders (order_number, customer_name, phone, email, address, notes, items, total, payment_method, order_status, payment_status)
    VALUES (?,?,?,?,?,?,?,?,?, 'PENDING','PENDING')`)
    .run(num, customer.name, customer.phone, customer.email || '', customer.address || '', notes || '', JSON.stringify(fullItems), total, paymentMethod);
  const order = await db.prepare('SELECT * FROM orders WHERE order_number = ?').get(num);
  res.status(201).json({ success: true, data: { ...order, items: JSON.parse(order.items), paymentLabel: PAY_METHODS[paymentMethod] } });
});

app.get('/api/orders/track/:num', async (req, res) => {
  const o = await db.prepare('SELECT * FROM orders WHERE order_number = ?').get(String(req.params.num).trim().toUpperCase());
  if (!o) return res.status(404).json({ success: false, message: 'لا يوجد طلب بهذا الرقم — تأكد من الرقم وحاول تاني' });
  res.json({ success: true, data: { ...o, items: JSON.parse(o.items || '[]') } });
});

// ---------------- CONTACT ----------------
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body || {};
  if (!name || !message || message.length < 5) return res.status(400).json({ success: false, message: 'أدخل الاسم ورسالة لا تقل عن 5 أحرف' });
  await db.prepare('INSERT INTO messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)').run(name, email || '', phone || '', subject || '', message);
  res.json({ success: true, message: 'تم استلام رسالتك بنجاح ✅ هنتواصل معاك قريباً' });
});

// ---------------- OFFERS ----------------
app.get('/api/offers', async (_req, res) => {
  res.json({ success: true, data: await db.prepare('SELECT * FROM offers WHERE active = 1 ORDER BY discount DESC').all() });
});

// ---------------- RESERVATIONS ----------------
app.post('/api/reservations', async (req, res) => {
  const { name, phone, guests, date, time, notes } = req.body || {};
  if (!name || !phone || !date || !time) return res.status(400).json({ success: false, message: 'الاسم والهاتف والتاريخ والوقت مطلوبة' });
  await db.prepare('INSERT INTO reservations (name, phone, guests, date, time, notes) VALUES (?,?,?,?,?,?)')
    .run(name, phone, Number(guests) || 2, date, time, notes || '');
  res.status(201).json({ success: true, message: 'تم استلام حجزك ✅ هنتصل بك لتأكيد الطاولة' });
});

// ---------------- REVIEWS ----------------
app.get('/api/reviews', async (_req, res) => {
  res.json({ success: true, data: await db.prepare('SELECT * FROM reviews WHERE approved = 1 ORDER BY id DESC LIMIT 12').all() });
});

// ---------------- HEALTH ----------------
app.get('/api/health', async (_req, res) => {
  let dbOk = true, dishes = 0, orders = 0;
  try {
    dishes = (await db.prepare('SELECT COUNT(*) c FROM menu_items').get()).c;
    orders = (await db.prepare('SELECT COUNT(*) c FROM orders').get()).c;
  } catch (_) { dbOk = false; }
  res.json({ ok: true, db: dbOk, engine: MODE, persistent: PERSISTENT, dishes, orders, uptime: Math.round(process.uptime()) + 's', time: new Date().toISOString() });
});

// ---------------- ADMIN ----------------
app.get('/api/admin/reservations', adminRequired, async (_req, res) => {
  res.json({ success: true, data: await db.prepare('SELECT * FROM reservations ORDER BY id DESC LIMIT 100').all() });
});

app.put('/api/admin/reservations/:id', adminRequired, async (req, res) => {
  await db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run((req.body || {}).status || 'PENDING', req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/dashboard', adminRequired, async (_req, res) => {
  const q = async (s) => (await db.prepare(s).get()).c;
  const revenueRow = await db.prepare(`SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE order_status != 'CANCELLED'`).get();
  res.json({ success: true, data: {
    dishes: await q('SELECT COUNT(*) c FROM menu_items'),
    trays: await q('SELECT COUNT(*) c FROM trays'),
    totalOrders: await q('SELECT COUNT(*) c FROM orders'),
    pendingOrders: await q(`SELECT COUNT(*) c FROM orders WHERE order_status='PENDING'`),
    completedOrders: await q(`SELECT COUNT(*) c FROM orders WHERE order_status='COMPLETED'`),
    revenue: revenueRow.s,
    newMessages: await q(`SELECT COUNT(*) c FROM messages WHERE status='NEW'`),
    reservations: await q(`SELECT COUNT(*) c FROM reservations WHERE status='PENDING'`),
  } });
});

app.get('/api/admin/orders', adminRequired, async (_req, res) => {
  const rows = await db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 100').all();
  res.json({ success: true, data: rows.map((o) => ({ ...o, items: JSON.parse(o.items || '[]') })) });
});

app.put('/api/admin/orders/:id/status', adminRequired, async (req, res) => {
  const { orderStatus } = req.body || {};
  if (!orderStatus) return res.status(400).json({ success: false, message: 'orderStatus مطلوب' });
  await db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(orderStatus, req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/menu', adminRequired, async (_req, res) => {
  res.json({ success: true, data: (await db.prepare('SELECT * FROM menu_items ORDER BY id').all()).map(dishOut) });
});

app.post('/api/admin/menu', adminRequired, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || !b.price) return res.status(400).json({ success: false, message: 'الاسم والقسم والسعر مطلوبة' });
  const r = await db.prepare('INSERT INTO menu_items (name, category, price, old_price, description, ingredients, image, available, featured) VALUES (?,?,?,?,?,?,?,1,?)')
    .run(b.name, b.category, Number(b.price), b.old_price ? Number(b.old_price) : null, b.description || '', JSON.stringify(normList(b.ingredients)), b.image || '', b.featured ? 1 : 0);
  res.status(201).json({ success: true, data: dishOut(await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(r.lastInsertRowid)) });
});

app.put('/api/admin/menu/:id', adminRequired, async (req, res) => {
  const b = req.body || {};
  const old = await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ success: false, message: 'غير موجود' });
  await db.prepare('UPDATE menu_items SET name=?, category=?, price=?, description=?, ingredients=?, image=?, available=?, featured=? WHERE id=?')
    .run(b.name ?? old.name, b.category ?? old.category, b.price != null ? Number(b.price) : old.price,
      b.description ?? old.description, b.ingredients === undefined ? old.ingredients : JSON.stringify(normList(b.ingredients)), b.image ?? old.image,
      b.available === undefined ? old.available : (b.available ? 1 : 0),
      b.featured === undefined ? old.featured : (b.featured ? 1 : 0), req.params.id);
  res.json({ success: true, data: dishOut(await db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id)) });
});

app.delete('/api/admin/menu/:id', adminRequired, async (req, res) => {
  await db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/messages', adminRequired, async (_req, res) => {
  res.json({ success: true, data: await db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 100').all() });
});

app.put('/api/admin/messages/:id', adminRequired, async (req, res) => {
  await db.prepare('UPDATE messages SET status = ? WHERE id = ?').run((req.body || {}).status || 'READ', req.params.id);
  res.json({ success: true });
});

// SPA-ish fallback: any unknown extension-less GET → home
app.get(/^\/(?!api).*/, async (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// أي خطأ غير متوقع → رد JSON بدل ما السيرفر يقع
app.use((err, _req, res, _next) => {
  console.error('❌', err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: 'حصل خطأ في السيرفر — حاول مرة تانية' });
});
process.on('unhandledRejection', (e) => console.error('⚠️ unhandledRejection:', e));

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log('=================================');
      console.log(`🚀 سيرفر مطعم النجوم شغال على: http://localhost:${PORT}`);
      console.log(PERSISTENT
        ? '💾 قاعدة البيانات: ' + DB_LABEL + ' — البيانات مش بتتمسح'
        : '⚠️ قاعدة البيانات: ملف محلي (للتجربة بس). على الاستضافة لازم DATABASE_URL (Supabase) — راجع README');
      console.log('=================================');
    });
  })
  .catch((e) => { console.error('❌ فشل تشغيل قاعدة البيانات:', e); process.exit(1); });
