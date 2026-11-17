// ============================================================
// STARS RESTAURANT — مطعم النجوم — Database layer (libSQL / SQLite)
// - محلياً: ملف SQLite عادي (stars_database.db)
// - على الاستضافة: قاعدة Turso مجانية ودائمة (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)
// ============================================================
const { createClient } = require('@libsql/client');
const path = require('path');
const bcrypt = require('bcryptjs');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const PERSISTENT = !!TURSO_URL;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'stars_database.db');

const client = createClient(
  PERSISTENT
    ? { url: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:' + DB_PATH }
);

const clean = (args) => args.map((a) => (a === undefined ? null : a));
const rowsToObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

// نفس شكل prepare().get/all/run بس async (لازم await)
const db = {
  prepare(sql) {
    return {
      all: async (...args) => rowsToObjects(await client.execute({ sql, args: clean(args) })),
      get: async (...args) => rowsToObjects(await client.execute({ sql, args: clean(args) }))[0],
      run: async (...args) => {
        const rs = await client.execute({ sql, args: clean(args) });
        return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) };
      },
    };
  },
  exec: (sql) => client.executeMultiple(sql),
};

// الصور محلية جوه المشروع: assets/img/<id>.jpg (بتتحمّل مرة واحدة بالأمر: npm run images)
const IMG = (id) => `/assets/img/${id}`;

async function initDB() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, email TEXT UNIQUE, password TEXT,
      role TEXT DEFAULT 'USER',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, category TEXT NOT NULL,
      price REAL NOT NULL, old_price REAL,
      description TEXT, image TEXT,
      available INTEGER DEFAULT 1, featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS trays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, subtitle TEXT,
      price REAL NOT NULL, serves TEXT,
      items TEXT DEFAULT '[]', image TEXT, image_desc TEXT,
      available INTEGER DEFAULT 1, featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, description TEXT,
      discount INTEGER DEFAULT 0, code TEXT,
      image TEXT, active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT NOT NULL,
      guests INTEGER DEFAULT 2, date TEXT, time TEXT,
      notes TEXT, status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, rating INTEGER DEFAULT 5,
      text TEXT, approved INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      customer_name TEXT, phone TEXT, email TEXT, address TEXT, notes TEXT,
      items TEXT DEFAULT '[]', total REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      order_status TEXT DEFAULT 'PENDING',
      payment_status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, email TEXT, phone TEXT, subject TEXT, message TEXT,
      status TEXT DEFAULT 'NEW',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // قواعد قديمة: أضف عمود وصف الصورة لو مش موجود
  try { await db.exec('ALTER TABLE trays ADD COLUMN image_desc TEXT'); } catch (_) { /* العمود موجود بالفعل */ }
  await seedAdmin();
  await seedMenu();
  await seedTrays();
  await seedOrders();
  await seedOffers();
  await seedReviews();
}

async function seedAdmin() {
  // الباسورد مخزّن كـ hash فقط (مش نص صريح). ممكن تغيّره من متغيرات البيئة ADMIN_EMAIL / ADMIN_PASSWORD
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@stars.com';
  const ADMIN_HASH = process.env.ADMIN_PASSWORD
    ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10)
    : '$2a$10$931PAoUkgMpdvEwXEDwFUu2kAhrQXHsTboeqVGK/2hF.2iPUXYTSK';
  const row = await db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!row) {
    await db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'ADMIN')`)
      .run('أحمد النجوم', ADMIN_EMAIL, ADMIN_HASH);
    console.log('👑 تم إنشاء حساب الأدمن');
  }
}

const DISHES = [
  { name:'سمانة مشوية فاخرة', category:'مشويات', price:850, featured:1, image:IMG('CdXi3kDib6fMBcpK'), description:'سمانة طازجة مشوية على الفحم مع صوص التاماريند والأرز البسمتي.' },
  { name:'سمك بلطي مشوي على الفحم', category:'مشويات', price:320, image:IMG('nJslmLzWMCop7BSf'), description:'بلطي طازج متبل بالتوابل المصرية ومشوي على الفحم.' },
  { name:'دنيس مشوي محشي', category:'مشويات', price:480, featured:1, image:IMG('19I4VPwRIgvRdpbh'), description:'دنيس محشي بالبصل والفلفل والليمون مع صوص الجرمولة.' },
  { name:'فيليه هامور مشوي', category:'مشويات', price:690, image:IMG('HQ28omk0dfzddrA7'), description:'فيليه هامور فاخر بالزبدة والثوم والليمون.' },
  { name:'سيخ جمبري مشوي', category:'أسماك', price:550, image:IMG('3fYIzYW9Y5pPaio8'), description:'سيخ جمبري مشوي مع خضار مشكلة وصوص الليمون.' },
  { name:'تونة مشوية بالليمون', category:'أسماك', price:420, image:IMG('1rvYkmtQWTT9kOmg'), description:'ستيك تونة طازج مشوي ومتبل بالتاماريند.' },
  { name:'فيليه قاروص بالفرن', category:'أسماك', price:610, featured:1, image:IMG('YkZBVsAO0Z6u9Mh2'), description:'قاروص بالزبدة والثوم في الفرن مع البطاطس.' },
  { name:'جمبري مشوي بالثوم', category:'جمبري', price:390, featured:1, image:IMG('wMBHrKbeWSpN5YRQ'), description:'جمبري جامبو مشوي بالزبدة والثوم والبقدونس.' },
  { name:'جمبري كاجون حار', category:'جمبري', price:430, image:IMG('GfB8M68XIdiFMlMc'), description:'جمبري بتوابل الكاجون الحارة — لمحبي الحراق.' },
  { name:'جمبري مقلي كرسبي', category:'جمبري', price:350, image:IMG('FZBwmx5QmOg3Ydnh'), description:'جمبري مقرمش مقلي مع صوص التارتار الخاص.' },
  { name:'جمبري بالتاماريند', category:'جمبري', price:460, image:IMG('enmlJPPk81nSE9zW'), description:'جمبري مشوي بصوص التاماريند الحلو الحار.' },
  { name:'سبيط مشوي', category:'سبيط وكاليماري', price:410, image:IMG('LPkWQNdUHda6Rvxb'), description:'سبيط طازج مشوي مع صوص الليمون والزيتون.' },
  { name:'كاليماري مقرمش', category:'سبيط وكاليماري', price:380, image:IMG('WQYisSNrHR0b9mBP'), description:'حلقات كاليماري مقلية مقرمشة مع صوص المارينارا.' },
  { name:'تشكيلة سوشي VIP', category:'سوشي', price:950, featured:1, image:IMG('HbohWI5w5AbGcPAu'), description:'تشكيلة فاخرة من 24 قطعة سوشي متنوعة يقدمها الشيف.' },
  { name:'سوشي سلمون رول', category:'سوشي', price:520, image:IMG('DRWiUMvJlJy4nvWS'), description:'رول سلمون طازج مع أفوكادو وصوص الصويا.' },
  { name:'تشكيلة مقبلات النجوم', category:'مقبلات', price:260, image:IMG('lOGfSq11TSOwJ50j'), description:'تشكيلة مقبلات بحرية: سلطات ومخللات وصوصات.' },
  { name:'شوربة سي فود كريم', category:'مقبلات', price:220, image:IMG('0hyP9rejlO6LYKwt'), description:'شوربة كريم بصدف البحر والجمبري — طبق الشيف المميز.' },
];

async function seedMenu() {
  const c = (await db.prepare('SELECT COUNT(*) AS c FROM menu_items').get()).c;
  if (c > 0) return;
  const ins = db.prepare('INSERT INTO menu_items (name, category, price, old_price, description, image, available, featured) VALUES (?,?,?,?,?,?,1,?)');
  for (const d of DISHES) await ins.run(d.name, d.category, d.price, d.old_price || null, d.description, d.image, d.featured ? 1 : 0);
  console.log(`🍽️ تم إدخال ${DISHES.length} طبق في المنيو`);
}

const TRAYS = [
  { name:'صينية الوحش', subtitle:'التجربة الأولى للفخامة', price:4500, serves:'تكفي 6 أشخاص', image:IMG('68XCf2g9GsLYVz75'),
    image_desc:'صينية نحاس مطروق مقدّمة على حجر أسود: سمكة كاملة مشوية بالأعشاب والليمون، جمبري جامبو مشوي بالثوم والبقدونس، حلقات كاليماري مقرمشة، سبيط مشوي مشقّق، وأرز بالزعفران بالجمبري والبلح والبسلة، مع طماطم كرزي مشوية وصوصات (ثوم، تارتار، مايونيز) وأعشاب طازجة وشموع.',
    items:['سمانة مشوية','جمبري جامبو بالثوم','دنيس مشوي','كاليماري مقرمش','سبيط مشوي','سلطة بحرية','أرز بالزعفران بالمأكولات البحرية','طماطم كرزي مشوية','صوصات (ثوم وتارتار ومايونيز)','ليمون وأعشاب طازجة'] },
  { name:'صينية الكينج', subtitle:'لعشاءات العائلة الكبيرة', price:6500, serves:'تكفي 8 أشخاص', image:IMG('YsdWmuuNWqHqnJJR'),
    image_desc:'صينية دائرية كبيرة فيها كابوريا حمراء بمخالبها، لانجوستين (قريدس كبير) مشوي، جمبري جامبو مشوي وجمبري مقشّر بالثوم والأعشاب، مع ليمون مشوي وصوصات.',
    items:['لوبستر مشوي كامل','سمانة مشوية','جمبري كاجون','سبيط مشوي','فيليه قاروص','تشكيلة مقبلات','أرز بالجمبري'] },
  { name:'صينية الغول', subtitle:'الوحش الحقيقي للبحر', price:9000, serves:'تكفي 12 شخص', image:IMG('7qmfBsmprwGVdAjt'),
    image_desc:'كابوريا كاملة مع مخالبها الكبيرة ولانجوستين مشوي مرصوص على صينية معدنية مع أعشاب الشبت والروزماري.',
    items:['لوبسترين مشويين','سمانتين مشويتين','جمبري بكل الطرق','كابوريا طازجة','سبيط مشوي','تشكيلة سوشي','أطباق جانبية'] },
  { name:'صينية التنين', subtitle:'أضخم صينية — للمناسبات الكبيرة', price:14000, serves:'تكفي 18 شخص', image:IMG('m8pjRekKYf29HQMQ'),
    image_desc:'صينية ذهبية ضخمة على طاولة رخام: كابوريا حمراء بمخالبها، لانجوستين مشوي، جمبري جامبو مشوي، جمبري مقشّر بالثوم والأعشاب، دنيس كامل مشوي، سبيط مشوي، بلح بحر وأم الخلول بالزبدة والثوم، مع ليمون مشوي وأربعة صوصات (زبدة وأعشاب، حار، طماطم، تارتار).',
    items:['3 لوبستر مشوي','لانجوستين مشوي','سمك دنيس كامل مشوي','جمبري جامبو 2 كيلو','جمبري مقشّر بالثوم والأعشاب','كابوريا بمخالبها','سبيط مشوي','بلح بحر وأم الخلول بالزبدة والثوم','ليمون مشوي','صوصات مشكلة','تشكيلة سوشي VIP','كل المقبلات','حلويات المطعم'] },
  { name:'صينية الأسماك المتوسطة', subtitle:'اختيار سريع ولذيذ', price:2500, serves:'تكفي 4 أشخاص', image:IMG('1euWXOTlKPEklumC'),
    image_desc:'سمكة مشوية بالأعشاب مع جمبري مشوي وأرز بالزعفران بالمأكولات البحرية وليمون وأعشاب طازجة.',
    items:['ذيل لوبستر مشوي','فيليه سمك مشوي','جمبري بالثوم','سلطة','أرز'] },
  { name:'صينية الجمبري المتوسطة', subtitle:'عشاق الجمبري فقط', price:2200, serves:'تكفي 4 أشخاص', image:IMG('7cR5OS6o20HvBHXV'),
    image_desc:'جمبري جامبو مشوي مع جمبري مقشّر متبّل بالثوم والبقدونس وشرائح ليمون مشوي.',
    items:['جمبري مشوي بالثوم','جمبري كاجون','جمبري مقلي','صوصات مشكلة'] },
];

async function seedTrays() {
  const c = (await db.prepare('SELECT COUNT(*) AS c FROM trays').get()).c;
  if (c > 0) {
    // قواعد قديمة: املأ وصف الصورة للصواني اللي ملهاش وصف
    for (const t of TRAYS) await db.prepare("UPDATE trays SET image_desc = ? WHERE image = ? AND (image_desc IS NULL OR image_desc = '')").run(t.image_desc || '', t.image);
    return;
  }
  const ins = db.prepare('INSERT INTO trays (name, subtitle, price, serves, items, image, image_desc, available, featured) VALUES (?,?,?,?,?,?,?,1,?)');
  for (const t of TRAYS) await ins.run(t.name, t.subtitle, t.price, t.serves, JSON.stringify(t.items), t.image, t.image_desc || '', t.featured ? 1 : 0);
  console.log(`🥘 تم إدخال ${TRAYS.length} صينية`);
}

async function seedOrders() {
  if (process.env.SEED_DEMO_ORDERS === 'false') return;
  const c = (await db.prepare('SELECT COUNT(*) AS c FROM orders').get()).c;
  if (c > 0) return;
  const trays = await db.prepare('SELECT * FROM trays').all();
  const ins = db.prepare(`INSERT INTO orders (order_number, customer_name, phone, email, address, notes, items, total, payment_method, order_status, payment_status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`);
  const SAMPLES = [
    ['محمد عبد الله','01001234567','mohamed@gmail.com','المعادي، القاهرة','خالٍ من الفول السوداني','CONFIRMED','PAID','-2 days'],
    ['فاطمة السيد','01122334455','fatma@gmail.com','سموحة، الإسكندرية','','PENDING','PENDING','-1 days'],
    ['أحمد حسن','01234567890','ahmed.hassan@yahoo.com','المنصورة','','COMPLETED','PAID','-4 days'],
    ['سارة محمود','01555667788','sara.m@gmail.com','التجمع الخامس','توصيل الساعة 8 مساءً','CONFIRMED','PAID','-3 days'],
    ['خالد إبراهيم','01099887766','khaled@outlook.com','طنطا','','CANCELLED','REFUNDED','-5 days'],
    ['منى مصطفى','01277889900','mona.m@gmail.com','الشيخ زايد','مناسبة عيد ميلاد','COMPLETED','PAID','-6 days'],
    ['عمر فؤاد','01144556677','omar@gmail.com','الرحاب','','PENDING','PENDING','-8 hours'],
    ['هدى ناصر','01566778899','hoda@gmail.com','6 أكتوبر','طلبات إضافية من الصوصات','COMPLETED','PAID','-9 days'],
  ];
  for (const [name, phone, email, address, notes, status, pay, ago] of SAMPLES) {
    const t = trays[Math.floor(Math.random() * trays.length)];
    const items = JSON.stringify([{ type: 'tray', id: t.id, name: t.name, price: t.price, qty: 1 }]);
    await ins.run('ST-' + Math.random().toString(36).slice(2, 6).toUpperCase() + Date.now().toString().slice(-4), name, phone, email, address, notes, items, t.price, ['VODAFONE_CASH','CASH','VISA'][Math.floor(Math.random()*3)], status, pay, ago);
  }
  console.log('🧾 تم إدخال 8 طلبات تجريبية');
}

const OFFERS = [
  { title:'خصم 25% على صينية الوحش', description:'اكسب خصم 25% على صينية الوحش كاملة — عرض محدود لفترة قصيرة.', discount:25, code:'STAR25', image:IMG('68XCf2g9GsLYVz75') },
  { title:'يوم التوأمة — 2×1 على الجمبري', description:'اطلب طبق جمبري بالثوم واحصل على التاني مجاناً كل ثلاثاء.', discount:50, code:'TWIN2', image:IMG('wMBHrKbeWSpN5YRQ') },
  { title:'عشاء العائلة — توصيل مجاني', description:'توصيل مجاني لأي صينية فوق 5000 جنيه داخل القاهرة والجيزة.', discount:10, code:'FREEDEL', image:IMG('shrimp-family-offer') },
  { title:'ليلة السوشي — خصم 20%', description:'خصم 20% على تشكيلة السوشي VIP من الأحد للخميس.', discount:20, code:'SUSHI20', image:IMG('HbohWI5w5AbGcPAu') },
];

async function seedOffers() {
  const c = (await db.prepare('SELECT COUNT(*) AS c FROM offers').get()).c;
  if (c > 0) return;
  const ins = db.prepare('INSERT INTO offers (title, description, discount, code, image, active) VALUES (?,?,?,?,?,1)');
  for (const o of OFFERS) await ins.run(o.title, o.description, o.discount, o.code, o.image);
  console.log(`🎁 تم إدخال ${OFFERS.length} عروض`);
}

const REVIEWS = [
  { name:'محمود السيد', rating:5, text:'أحلى مأكولات بحرية جربتها في حياتي — صينية الكينج تستاهل كل جنيه.' },
  { name:'نهى عبد العزيز', rating:5, text:'الخدمة راقية والسمك طازج فعلاً. حجزت طاولة عن الموقع وسليم تماماً.' },
  { name:'كريم فتحي', rating:4, text:'الجمبري بالثوم تحفة، والتوصيل كان أسرع من المتوقع.' },
  { name:'دينا صلاح', rating:5, text:'عملت عندم عزومة عائلية بصينية التنين — كل الضيوف اتسألوا على المطعم!' },
  { name:'طارق منير', rating:5, text:'أفضل سوشي في المدينة بلا منازع. الموقع نفسه سهل ومنظم.' },
  { name:'ياسمين حسن', rating:4, text:'المكان فخم والأسعار عادلة مقارنة بالجودة. هرجع تاني أكيد.' },
];

async function seedReviews() {
  const c = (await db.prepare('SELECT COUNT(*) AS c FROM reviews').get()).c;
  if (c > 0) return;
  const ins = db.prepare('INSERT INTO reviews (name, rating, text, approved) VALUES (?,?,?,1)');
  for (const r of REVIEWS) await ins.run(r.name, r.rating, r.text);
  console.log(`⭐ تم إدخال ${REVIEWS.length} تقييمات عملاء`);
}

module.exports = { db, initDB, PERSISTENT };
