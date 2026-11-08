# ⭐ مطعم النجوم — STARS RESTAURANT

موقع مطعم مأكولات بحرية فاخر — كامل متكامل: **10 صفحات منفصلة** (فرونت إند عربي RTL) + **باك إند Express + SQLite** + لوحة تحكم أدمن + سلة + طلبات وتتبع + حجز طاولات + عروض + تقييمات.

## 🚀 التشغيل السريع

> المتطلب: **Node.js 22.5+** (يستخدم `node:sqlite` المدمج — بدون قواعد بيانات خارجية).

```bash
npm install
npm start
# الموقع: http://localhost:3003
```

قاعدة البيانات `stars_database.db` بتتولد تلقائياً: أدمن + 17 طبق + 6 صواني + 4 عروض + 6 تقييمات + 8 طلبات تجريبية.

## 👑 الأدمن
`admin@stars.com` / `123456` — على `admin.html`

## 📄 الصفحات
الرئيسية / المنيو / الصواني / العروض / المعرض / احجز طاولة / اطلب الآن / الأسئلة الشائعة / اتصل بنا / لوحة التحكم

## 🔌 API
GET `/api/health` — GET `/api/menu` — GET `/api/trays` — GET `/api/offers` — GET `/api/reviews`
POST `/api/orders` — GET `/api/orders/track/:num` — POST `/api/reservations` — POST `/api/contact`
POST `/api/auth/login` — POST `/api/register` — GET/PUT/DELETE `/api/admin/...`

## 🌐 النشر على Render
ارفع على GitHub → render.com → New Web Service → اختار الريبو → Create (ملف `render.yaml` جاهز).
اللينك: `https://stars-restaurant.onrender.com`
