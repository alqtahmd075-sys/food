// ============================================================
// STARS RESTAURANT — مطعم النجوم — Main Server (Node >= 22)
// ============================================================
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { db, initDB } = require('./server/config/database');

const app = express();
const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'stars_restaurant_jwt_secret';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// static frontend
app.use(express.static(__dirname, { extensions: ['html'] }));

initDB();

// ---------------- helpers ----------------
const sign = (user) => jwt.sign({ id: user.id, role: user.role || 'USER' }, JWT_SECRET, { expiresIn: '7d' });
const pubUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'USER' });
function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) { try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch (_) {} }
  next();
}
app.use('/api', authOptional);
function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'غير مصرح — سجل دخول أولاً' });
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (!row || row.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'صلاحيات أدمن مطلوبة' });
  next();
}
const orderNumber = () => 'ST-' + Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString().slice(-4);

// ---------------- AUTH ----------------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.password) return res.status(401).json({ success: false, message: 'البريد أو كلمة المرور غير صحيحة' });
  if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false, message: 'البريد أو كلمة المرور غير صحيحة' });
  res.json({ success: true, token: sign(user), user: pubUser(user) });
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'أدخل جميع البيانات' });
  try {
    const r = db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'USER')`).run(name, email, bcrypt.hashSync(password, 10));
    const user = { id: r.lastInsertRowid, name, email, role: 'USER' };
    res.status(201).json({ success: true, token: sign(user), user: pubUser(user) });
  } catch (_) { res.status(400).json({ success: false, message: 'هذا البريد مسجل بالفعل' }); }
});

// ---------------- MENU ----------------
app.get('/api/menu', (req, res) => {
  const { category = '', featured = '' } = req.query;
  let sql = 'SELECT * FROM menu_items WHERE available = 1';
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (featured) sql += ' AND featured = 1';
  sql += ' ORDER BY featured DESC, id ASC';
  res.json({ success: true, data: db.prepare(sql).all(...p) });
});

app.get('/api/menu/categories', (_req, res) => {
  res.json({ success: true, data: db.prepare('SELECT category, COUNT(*) AS count FROM menu_items GROUP BY category ORDER BY id').all() });
});

// ---------------- TRAYS ----------------
app.get('/api/trays', (_req, res) => {
  const rows = db.prepare('SELECT * FROM trays WHERE available = 1 ORDER BY price ASC').all();
  res.json({ success: true, data: rows.map((t) => ({ ...t, items: JSON.parse(t.items || '[]') })) });
});

// ---------------- ORDERS ----------------
const PAY_METHODS = { CASH: 'الدفع عند الاستلام', VODAFONE_CASH: 'فودافون كاش 0120202003', VISA: 'فيزا / ماستركارد' };

app.post('/api/orders', (req, res) => {
  const { customer = {}, items = [], paymentMethod = 'CASH', notes } = req.body || {};
  if (!customer.name || !customer.phone) return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'السلة فاضية — اختر أطباقك أولاً' });

  let total = 0;
  const fullItems = [];
  for (const it of items) {
    const qty = Math.max(1, Number(it.qty) || 1);
    let row = null;
    if (it.type === 'tray') row = db.prepare('SELECT * FROM trays WHERE id = ?').get(it.id);
    else row = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(it.id);
    if (!row) return res.status(404).json({ success: false, message: 'أحد الأصناف المطلوبة غير موجود' });
    const price = Number(row.price);
    total += price * qty;
    fullItems.push({ type: it.type, id: row.id, name: row.name, price, qty });
  }
  if (!PAY_METHODS[paymentMethod]) return res.status(400).json({ success: false, message: 'طريقة دفع غير معروفة' });

  const num = orderNumber();
  db.prepare(`INSERT INTO orders (order_number, customer_name, phone, email, address, notes, items, total, payment_method, order_status, payment_status)
    VALUES (?,?,?,?,?,?,?,?,?, 'PENDING','PENDING')`)
    .run(num, customer.name, customer.phone, customer.email || '', customer.address || '', notes || '', JSON.stringify(fullItems), total, paymentMethod);
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(num);
  res.status(201).json({ success: true, data: { ...order, items: JSON.parse(order.items), paymentLabel: PAY_METHODS[paymentMethod] } });
});

app.get('/api/orders/track/:num', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(String(req.params.num).trim().toUpperCase());
  if (!o) return res.status(404).json({ success: false, message: 'لا يوجد طلب بهذا الرقم — تأكد من الرقم وحاول تاني' });
  res.json({ success: true, data: { ...o, items: JSON.parse(o.items || '[]') } });
});

// ---------------- CONTACT ----------------
app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body || {};
  if (!name || !message || message.length < 5) return res.status(400).json({ success: false, message: 'أدخل الاسم ورسالة لا تقل عن 5 أحرف' });
  db.prepare('INSERT INTO messages (name, email, phone, subject, message) VALUES (?,?,?,?,?)').run(name, email || '', phone || '', subject || '', message);
  res.json({ success: true, message: 'تم استلام رسالتك بنجاح ✅ هنتواصل معاك قريباً' });
});

// ---------------- OFFERS ----------------
app.get('/api/offers', (_req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM offers WHERE active = 1 ORDER BY discount DESC').all() });
});

// ---------------- RESERVATIONS ----------------
app.post('/api/reservations', (req, res) => {
  const { name, phone, guests, date, time, notes } = req.body || {};
  if (!name || !phone || !date || !time) return res.status(400).json({ success: false, message: 'الاسم والهاتف والتاريخ والوقت مطلوبة' });
  db.prepare('INSERT INTO reservations (name, phone, guests, date, time, notes) VALUES (?,?,?,?,?,?)')
    .run(name, phone, Number(guests) || 2, date, time, notes || '');
  res.status(201).json({ success: true, message: 'تم استلام حجزك ✅ هنتصل بك لتأكيد الطاولة' });
});

// ---------------- REVIEWS ----------------
app.get('/api/reviews', (_req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM reviews WHERE approved = 1 ORDER BY id DESC LIMIT 12').all() });
});

// ---------------- HEALTH ----------------
app.get('/api/health', (_req, res) => {
  let dbOk = true, dishes = 0, orders = 0;
  try {
    dishes = db.prepare('SELECT COUNT(*) c FROM menu_items').get().c;
    orders = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  } catch (_) { dbOk = false; }
  res.json({ ok: true, db: dbOk, dishes, orders, uptime: Math.round(process.uptime()) + 's', time: new Date().toISOString() });
});

// ---------------- ADMIN ----------------
app.get('/api/admin/reservations', adminRequired, (_req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM reservations ORDER BY id DESC LIMIT 100').all() });
});

app.put('/api/admin/reservations/:id', adminRequired, (req, res) => {
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run((req.body || {}).status || 'PENDING', req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/dashboard', adminRequired, (_req, res) => {
  const q = (s) => db.prepare(s).get().c;
  res.json({ success: true, data: {
    dishes: q('SELECT COUNT(*) c FROM menu_items'),
    trays: q('SELECT COUNT(*) c FROM trays'),
    totalOrders: q('SELECT COUNT(*) c FROM orders'),
    pendingOrders: q(`SELECT COUNT(*) c FROM orders WHERE order_status='PENDING'`),
    completedOrders: q(`SELECT COUNT(*) c FROM orders WHERE order_status='COMPLETED'`),
    revenue: db.prepare(`SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE order_status != 'CANCELLED'`).get().s,
    newMessages: q(`SELECT COUNT(*) c FROM messages WHERE status='NEW'`),
    reservations: q(`SELECT COUNT(*) c FROM reservations WHERE status='PENDING'`),
  } });
});

app.get('/api/admin/orders', adminRequired, (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 100').all();
  res.json({ success: true, data: rows.map((o) => ({ ...o, items: JSON.parse(o.items || '[]') })) });
});

app.put('/api/admin/orders/:id/status', adminRequired, (req, res) => {
  const { orderStatus } = req.body || {};
  if (!orderStatus) return res.status(400).json({ success: false, message: 'orderStatus مطلوب' });
  db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(orderStatus, req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/menu', adminRequired, (_req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM menu_items ORDER BY id').all() });
});

app.post('/api/admin/menu', adminRequired, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || !b.price) return res.status(400).json({ success: false, message: 'الاسم والقسم والسعر مطلوبة' });
  const r = db.prepare('INSERT INTO menu_items (name, category, price, old_price, description, image, available, featured) VALUES (?,?,?,?,?,?,1,?)')
    .run(b.name, b.category, Number(b.price), b.old_price ? Number(b.old_price) : null, b.description || '', b.image || '', b.featured ? 1 : 0);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(r.lastInsertRowid) });
});

app.put('/api/admin/menu/:id', adminRequired, (req, res) => {
  const b = req.body || {};
  const old = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ success: false, message: 'غير موجود' });
  db.prepare('UPDATE menu_items SET name=?, category=?, price=?, description=?, image=?, available=?, featured=? WHERE id=?')
    .run(b.name ?? old.name, b.category ?? old.category, b.price != null ? Number(b.price) : old.price,
      b.description ?? old.description, b.image ?? old.image,
      b.available === undefined ? old.available : (b.available ? 1 : 0),
      b.featured === undefined ? old.featured : (b.featured ? 1 : 0), req.params.id);
  res.json({ success: true, data: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id) });
});

app.delete('/api/admin/menu/:id', adminRequired, (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/messages', adminRequired, (_req, res) => {
  res.json({ success: true, data: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 100').all() });
});

app.put('/api/admin/messages/:id', adminRequired, (req, res) => {
  db.prepare('UPDATE messages SET status = ? WHERE id = ?').run((req.body || {}).status || 'READ', req.params.id);
  res.json({ success: true });
});

// SPA-ish fallback: any unknown extension-less GET → home
app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log('=================================');
  console.log(`🚀 سيرفر مطعم النجوم شغال على: http://localhost:${PORT}`);
  console.log('👑 الأدمن: admin@stars.com / 123456');
  console.log('=================================');
});
