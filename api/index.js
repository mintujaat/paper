const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SECRET_KEY = String(process.env.SUPABASE_SECRET_KEY || "").trim();
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

const razorpayReady = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpay = razorpayReady ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;

const SESSION_COOKIE = "mintu_quiz_session";
const ADMIN_COOKIE = "mintu_quiz_admin";
const FREE_COOKIE = "mintu_quiz_free_used";
const SESSION_SECRET = String(process.env.SESSION_SECRET || "");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const SITE_NAME = String(process.env.SITE_NAME || "YaadPage").trim().slice(0, 60);
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHANNEL_ID = String(process.env.TELEGRAM_CHANNEL_ID || "").trim();

const attempts = new Map();
function rateAllowed(req, key, max = 20, windowMs = 10 * 60 * 1000) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const item = attempts.get(id) || { start: now, count: 0 };
  if (now - item.start > windowMs) { item.start = now; item.count = 0; }
  item.count += 1;
  attempts.set(id, item);
  if (attempts.size > 4000) for (const [k, v] of attempts) if (now - v.start > windowMs) attempts.delete(k);
  return item.count <= max;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET || "local-dev").update(body).digest("base64url");
  return `${body}.${sig}`;
}
function unsign(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", SESSION_SECRET || "local-dev").update(body).digest("base64url");
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function cookie(req, name) {
  const part = String(req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}
function appendCookie(res, name, value, seconds = 7 * 86400) {
  const line = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  const prev = res.getHeader("Set-Cookie");
  if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, line]);
  else if (prev) res.setHeader("Set-Cookie", [prev, line]);
  else res.setHeader("Set-Cookie", line);
}
function clearCookie(res, name) { appendCookie(res, name, "", 0); }

function userFromReq(req) {
  const p = unsign(cookie(req, SESSION_COOKIE));
  return p?.uid ? { uid: p.uid, email: p.email, name: p.name } : null;
}
function requireUser(req, res, next) {
  const user = userFromReq(req);
  if (!user) return res.status(401).json({ error: "Please log in first." });
  req.user = user; next();
}
function requireAdmin(req, res, next) {
  const p = unsign(cookie(req, ADMIN_COOKIE));
  if (!p?.admin) return res.status(401).json({ error: "Admin login required." });
  next();
}

async function supa(query) {
  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}
function errorText(e) {
  return String(e?.message || e?.error?.description || "Something went wrong.").slice(0, 350);
}
function asNum(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function money(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function escTg(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function istNow() { return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
async function notifyTelegramAdmin(htmlMessage) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${encodeURIComponent(TELEGRAM_BOT_TOKEN)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, text: htmlMessage, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(1500)
    });
  } catch (err) { console.error("Telegram notify error:", err?.message || err); }
}

function clientIpHash(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  if (!ip) return "";
  return crypto.createHmac("sha256", SESSION_SECRET || "local-dev").update(ip).digest("hex").slice(0, 32);
}

async function getSettings() {
  const { data } = await supa(db.from("quiz_settings").select("*").eq("id", "main").maybeSingle());
  return {
    siteName: data?.site_name || SITE_NAME,
    freePapersPerDevice: Math.max(0, Number(data?.free_papers_per_device ?? 1)),
    defaultPaperPrice: Math.max(0, Number(data?.default_paper_price ?? 25)),
    announcementEnabled: Boolean(data?.announcement_enabled),
    announcementText: String(data?.announcement_text || ""),
    totalVisitors: Number(data?.total_visitors || 0),
    todayVisitors: data?.visitor_day === new Date().toISOString().slice(0, 10) ? Number(data?.today_visitors || 0) : 0
  };
}

function safeUser(row) {
  return {
    id: row.id, name: row.name || "Student", email: row.email || "", city: row.city || "", state: row.state || "",
    avatarUrl: row.avatar_url || "", authProvider: row.google_sub ? "google" : "email",
    paperCredits: Number(row.paper_credits || 0), freePapersUsed: Number(row.free_papers_used || 0), disabled: row.disabled === true, createdAt: row.created_at
  };
}

async function checkFreeEligible(req, userRow, settings) {
  if (settings.freePapersPerDevice <= 0) return false;
  if (userRow && Number(userRow.free_papers_used || 0) >= settings.freePapersPerDevice) return false;
  if (cookie(req, FREE_COOKIE) === "1" || req.body?.deviceFreeUsed === true) return false;
  const deviceId = String(req.body?.deviceId || req.query?.deviceId || "").trim().slice(0, 80);
  const deviceFp = String(req.body?.deviceFp || req.query?.deviceFp || "").trim().slice(0, 80);
  const ipHash = clientIpHash(req);
  const checks = [];
  if (deviceId) checks.push(`device_id.eq.${deviceId}`);
  if (deviceFp) checks.push(`device_fp.eq.${deviceFp}`);
  if (ipHash) checks.push(`ip_hash.eq.${ipHash}`);
  if (checks.length) {
    const { data } = await supa(db.from("quiz_free_claims").select("id").or(checks.join(",")).limit(settings.freePapersPerDevice));
    if ((data || []).length >= settings.freePapersPerDevice) return false;
  }
  return true;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Public Config & Visitor Counter --------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, razorpay: razorpayReady }));

app.post("/api/public/visit", async (_req, res) => {
  try {
    const { data } = await supa(db.rpc("quiz_increment_visitor"));
    res.json(data || { totalVisitors: 0, todayVisitors: 0 });
  } catch { res.json({ totalVisitors: 0, todayVisitors: 0 }); }
});

app.get("/api/public/config", async (req, res) => {
  try {
    const settings = await getSettings();
    const user = userFromReq(req);
    let userRow = null;
    if (user) {
      const { data } = await supa(db.from("quiz_users").select("*").eq("id", user.uid).maybeSingle());
      if (data && !data.disabled) userRow = data;
    }
    const freeEligible = await checkFreeEligible(req, userRow, settings);
    res.set("Cache-Control", "no-store");
    res.json({
      siteName: settings.siteName,
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
      razorpayReady,
      freePapersPerDevice: settings.freePapersPerDevice,
      defaultPaperPrice: settings.defaultPaperPrice,
      freeEligible,
      announcement: { enabled: settings.announcementEnabled, text: settings.announcementText }
    });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Student Auth ---------------------------------------------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    if (!rateAllowed(req, "signup", 10)) return res.status(429).json({ error: "Too many attempts. Try again later." });
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 160);
    const city = String(req.body?.city || "").trim().slice(0, 60);
    const password = String(req.body?.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
      return res.status(400).json({ error: "Enter name, valid email, and password (6+ characters)." });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex"))));
    const { data } = await supa(db.from("quiz_users").insert({
      name, email, city, password_hash: hash, password_salt: salt, disabled: false
    }).select("*").single());
    appendCookie(res, SESSION_COOKIE, sign({ uid: data.id, name, email, exp: Date.now() + 7 * 86400000 }));
    await notifyTelegramAdmin(`🆕 <b>New Student Registered (Email)</b>\n👤 <b>${escTg(name)}</b> (${escTg(city || "India")})\n📧 <code>${escTg(email)}</code>\n🕒 ${escTg(istNow())}`);
    res.json({ ok: true, user: safeUser(data) });
  } catch (e) {
    if (e?.code === "23505") return res.status(409).json({ error: "Account with this email already exists." });
    res.status(500).json({ error: errorText(e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!rateAllowed(req, "login", 15)) return res.status(429).json({ error: "Too many login attempts." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const { data } = await supa(db.from("quiz_users").select("*").eq("email", email).maybeSingle());
    if (!data || !data.password_hash || !data.password_salt) return res.status(401).json({ error: "Use Google Sign-In for this account." });
    const cand = await new Promise((resolve, reject) => crypto.scrypt(password, data.password_salt, 64, (err, key) => err ? reject(err) : resolve(key.toString("hex"))));
    const a = Buffer.from(cand, "hex"); const b = Buffer.from(String(data.password_hash), "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Invalid email or password." });
    if (data.disabled) return res.status(403).json({ error: "Account disabled. Contact admin." });
    appendCookie(res, SESSION_COOKIE, sign({ uid: data.id, name: data.name, email: data.email, exp: Date.now() + 7 * 86400000 }));
    res.json({ ok: true, user: safeUser(data) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/auth/google", async (req, res) => {
  try {
    if (!rateAllowed(req, "google", 20)) return res.status(429).json({ error: "Too many sign-in attempts." });
    const credential = String(req.body?.credential || "").trim();
    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) return res.status(503).json({ error: "Google Sign-In is not configured." });
    if (!credential) return res.status(400).json({ error: "Google credential missing." });
    const vr = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(8000) });
    if (!vr.ok) return res.status(401).json({ error: "Google verification failed." });
    const profile = await vr.json();
    if (profile.aud !== clientId || !(profile.email_verified === "true" || profile.email_verified === true) || !profile.sub || !profile.email) {
      return res.status(401).json({ error: "Google account could not be verified." });
    }
    const email = String(profile.email).toLowerCase().slice(0, 160);
    const name = String(profile.name || email.split("@")[0] || "Student").slice(0, 60);
    const avatarUrl = /^https:\/\//.test(String(profile.picture || "")) ? String(profile.picture).slice(0, 500) : "";
    let { data: user } = await supa(db.from("quiz_users").select("*").eq("google_sub", String(profile.sub)).maybeSingle());
    let isNew = false;
    if (!user) {
      const byEmail = await supa(db.from("quiz_users").select("*").eq("email", email).maybeSingle());
      user = byEmail.data;
      if (user) {
        const up = await supa(db.from("quiz_users").update({ google_sub: String(profile.sub), avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("id", user.id).select("*").single());
        user = up.data;
      } else {
        const cr = await supa(db.from("quiz_users").insert({ name, email, google_sub: String(profile.sub), avatar_url: avatarUrl, disabled: false }).select("*").single());
        user = cr.data; isNew = true;
      }
    }
    if (user.disabled) return res.status(403).json({ error: "Account disabled." });
    appendCookie(res, SESSION_COOKIE, sign({ uid: user.id, name: user.name, email: user.email, exp: Date.now() + 7 * 86400000 }));
    if (isNew) await notifyTelegramAdmin(`🆕 <b>New Student Registered (Google)</b>\n👤 <b>${escTg(user.name)}</b>\n📧 <code>${escTg(user.email)}</code>\n🕒 ${escTg(istNow())}`);
    res.json({ ok: true, user: safeUser(user), isNew });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.get("/api/auth/me", async (req, res) => {
  const user = userFromReq(req);
  if (!user) return res.json({ authenticated: false, user: null });
  try {
    const [{ data }, { data: paidRows }] = await Promise.all([
      supa(db.from("quiz_users").select("*").eq("id", user.uid).maybeSingle()),
      supa(db.from("quiz_payments").select("razorpay_order_id").eq("user_id", user.uid).eq("status", "paid").limit(1))
    ]);
    if (!data || data.disabled) { clearCookie(res, SESSION_COOKIE); return res.json({ authenticated: false, user: null }); }
    res.json({ authenticated: true, user: { ...safeUser(data), isPaidUser: (paidRows || []).length > 0 } });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/auth/logout", (_req, res) => { clearCookie(res, SESSION_COOKIE); res.json({ ok: true }); });

// Public Papers & Leaderboards -----------------------------------------------
app.get("/api/papers", async (_req, res) => {
  try {
    const [papersRes, rpcRes] = await Promise.all([
      supa(db.from("quiz_papers").select("*").eq("active", true).order("created_at", { ascending: true })),
      db.rpc("quiz_paper_counts")
    ]);
    const counts = new Map();
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      for (const row of rpcRes.data) counts.set(row.paper_id, Number(row.cnt || 0));
    } else {
      const { data: qCounts } = await supa(db.from("quiz_questions").select("paper_id").eq("active", true));
      for (const q of qCounts || []) counts.set(q.paper_id, (counts.get(q.paper_id) || 0) + 1);
    }
    res.set("Cache-Control", "public, max-age=20, stale-while-revalidate=90");
    res.json({
      papers: (papersRes.data || []).map(p => ({
        id: p.id, title: p.title, category: p.category, description: p.description,
        durationMinutes: Number(p.duration_minutes || 15),
        questionsPerAttempt: Number(p.questions_per_attempt || 25),
        priceInr: Number(p.price_inr || 25),
        totalBankQuestions: counts.get(p.id) || 0,
        sponsorName: p.sponsor_name || "", sponsorTagline: p.sponsor_tagline || "", sponsorLink: p.sponsor_link || ""
      }))
    });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.get("/api/papers/:id/leaderboard", async (req, res) => {
  try {
    const { data } = await supa(db.from("quiz_attempts").select("user_name,user_city,score,total_questions,accuracy_percent,time_taken_sec,submitted_at").eq("paper_id", req.params.id).eq("status", "completed").order("score", { ascending: false }).order("time_taken_sec", { ascending: true }).limit(20));
    res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
    res.json({ leaderboard: data || [] });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Plans & Razorpay Credit Pack Unlock ----------------------------------------
app.get("/api/plans", async (_req, res) => {
  try {
    const { data } = await supa(db.from("quiz_plans").select("*").eq("active", true).order("sort_order", { ascending: true }).order("price_inr", { ascending: true }));
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
    res.json({ plans: (data || []).map(p => ({ id: p.id, title: p.title, papersCount: Number(p.papers_count), priceInr: Number(p.price_inr), badge: p.badge || "" })) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/payments/create-order", requireUser, async (req, res) => {
  try {
    if (!razorpayReady) return res.status(503).json({ error: "Razorpay keys are not added in Vercel yet. Add RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to enable paid plans." });
    const planId = String(req.body?.planId || "").trim();
    const { data: plan } = await supa(db.from("quiz_plans").select("*").eq("id", planId).eq("active", true).maybeSingle());
    if (!plan) return res.status(404).json({ error: "Selected plan not found." });
    const amount = money(Math.max(1, Number(plan.price_inr || 25)));
    const credits = Math.max(1, Number(plan.papers_count || 1));
    const order = await razorpay.orders.create({ amount: Math.round(amount * 100), currency: "INR", receipt: `plan_${req.user.uid.slice(0, 8)}_${Date.now()}` });
    await supa(db.from("quiz_payments").insert({ razorpay_order_id: order.id, user_id: req.user.uid, plan_id: plan.id, credits_count: credits, amount, currency: "INR", status: "created" }));
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, planTitle: plan.title, papersCount: credits });
  } catch (e) { res.status(502).json({ error: errorText(e) }); }
});

app.post("/api/payments/verify", requireUser, async (req, res) => {
  try {
    if (!razorpayReady) return res.status(503).json({ error: "Razorpay is not configured." });
    const orderId = String(req.body?.razorpay_order_id || "");
    const paymentId = String(req.body?.razorpay_payment_id || "");
    const signature = String(req.body?.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) return res.status(400).json({ error: "Incomplete Razorpay response." });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: "Payment signature failed." });
    const payment = await razorpay.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.status !== "captured") return res.status(409).json({ error: "Payment not captured." });
    const { data } = await supa(db.rpc("quiz_credit_plan_payment", { p_razorpay_order_id: orderId, p_payment_id: paymentId, p_user_id: req.user.uid }));
    if (data && !data.alreadyCredited) {
      await notifyTelegramAdmin(`💰 <b>Paper Plan Purchased (₹${Number(data.amount || 0).toFixed(2)})</b>\n👤 ${escTg(req.user.name)} (<code>${escTg(req.user.email)}</code>)\n🎟 Credits Added: <b>+${data.addedCredits} Papers</b> (Total: ${data.paperCredits})\n🧾 Payment: <code>${escTg(paymentId)}</code>`);
    }
    res.json(data || { ok: true });
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

// Quiz Attempts (Start Random 25 -> Submit & Grade) --------------------------
app.get("/api/attempts", requireUser, async (req, res) => {
  try {
    const { data } = await supa(db.from("quiz_attempts").select("id,paper_id,score,total_questions,accuracy_percent,time_taken_sec,is_free,status,started_at,submitted_at").eq("user_id", req.user.uid).order("started_at", { ascending: false }).limit(30));
    res.json({ attempts: data || [] });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/attempts/start", requireUser, async (req, res) => {
  try {
    const paperId = String(req.body?.paperId || "").trim();
    const city = String(req.body?.city || "").trim().slice(0, 60);
    const shareWithSponsor = req.body?.shareWithSponsor === true;
    const [{ data: paper }, { data: userRow }, settings] = await Promise.all([
      supa(db.from("quiz_papers").select("*").eq("id", paperId).eq("active", true).maybeSingle()),
      supa(db.from("quiz_users").select("*").eq("id", req.user.uid).maybeSingle()),
      getSettings()
    ]);
    if (!paper) return res.status(404).json({ error: "Exam paper not found." });
    if (!userRow || userRow.disabled) return res.status(403).json({ error: "Account unavailable." });

    const freeOk = await checkFreeEligible(req, userRow, settings);
    let isFree = false;
    let usedCredit = false;
    if (freeOk) {
      isFree = true;
    } else if (Number(userRow.paper_credits || 0) > 0) {
      usedCredit = true;
    } else {
      return res.status(402).json({
        error: "Your 1st free paper is used and you have 0 paper credits. Choose a plan to continue.",
        requiresPlan: true
      });
    }

    const [{ data: allQIds }, { data: prevAttempts }] = await Promise.all([
      supa(db.from("quiz_questions").select("id").eq("paper_id", paper.id).eq("active", true)),
      supa(db.from("quiz_attempts").select("question_ids").eq("user_id", req.user.uid).eq("paper_id", paper.id).limit(40))
    ]);
    if (!allQIds || !allQIds.length) return res.status(409).json({ error: "No questions loaded in this paper yet. Ask admin to generate questions." });
    const seen = new Set();
    for (const a of prevAttempts || []) for (const qid of (Array.isArray(a.question_ids) ? a.question_ids : [])) seen.add(qid);
    const unseenIds = shuffle(allQIds.filter(q => !seen.has(q.id)).map(q => q.id));
    const seenIds = shuffle(allQIds.filter(q => seen.has(q.id)).map(q => q.id));
    const needed = Math.min(Number(paper.questions_per_attempt || 25), allQIds.length);
    const pickedIds = [...unseenIds, ...seenIds].slice(0, needed);
    const { data: pickedRows } = await supa(db.from("quiz_questions").select("id,question_text,option_a,option_b,option_c,option_d,topic,difficulty").in("id", pickedIds));
    const rowMap = new Map((pickedRows || []).map(r => [r.id, r]));
    const picked = pickedIds.map(id => rowMap.get(id)).filter(Boolean);

    const { data: attempt } = await supa(db.from("quiz_attempts").insert({
      user_id: req.user.uid, paper_id: paper.id, user_name: userRow.name, user_email: userRow.email,
      user_city: city || userRow.city || "", share_with_sponsor: shareWithSponsor,
      question_ids: picked.map(q => q.id), total_questions: picked.length,
      is_free: isFree, status: "in_progress"
    }).select("*").single());

    if (isFree) {
      await Promise.all([
        supa(db.from("quiz_users").update({ free_papers_used: Number(userRow.free_papers_used || 0) + 1, city: city || userRow.city || "", updated_at: new Date().toISOString() }).eq("id", req.user.uid)),
        supa(db.from("quiz_free_claims").insert({
          user_id: req.user.uid,
          device_id: String(req.body?.deviceId || "").slice(0, 80),
          device_fp: String(req.body?.deviceFp || "").slice(0, 80),
          ip_hash: clientIpHash(req)
        }))
      ]);
      appendCookie(res, FREE_COOKIE, "1", 315360000);
    } else if (usedCredit) {
      await supa(db.from("quiz_users").update({ paper_credits: Math.max(0, Number(userRow.paper_credits || 0) - 1), updated_at: new Date().toISOString() }).eq("id", req.user.uid));
    }

    res.json({
      ok: true,
      attemptId: attempt.id,
      isFree,
      paper: { id: paper.id, title: paper.title, durationMinutes: paper.duration_minutes, sponsorName: paper.sponsor_name, sponsorTagline: paper.sponsor_tagline, sponsorLink: paper.sponsor_link },
      questions: picked
    });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/attempts/:id/submit", requireUser, async (req, res) => {
  try {
    const { data: attempt } = await supa(db.from("quiz_attempts").select("*").eq("id", req.params.id).eq("user_id", req.user.uid).maybeSingle());
    if (!attempt) return res.status(404).json({ error: "Test attempt not found." });
    const qIds = Array.isArray(attempt.question_ids) ? attempt.question_ids : [];
    const alreadyDone = attempt.status === "completed";
    const userAnswers = alreadyDone
      ? (attempt.answers && typeof attempt.answers === "object" ? attempt.answers : {})
      : (req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {});
    const { data: qRows } = await supa(db.from("quiz_questions").select("*").in("id", qIds));
    const qMap = new Map((qRows || []).map(q => [q.id, q]));

    let score = 0;
    const review = qIds.map(id => {
      const q = qMap.get(id);
      if (!q) return null;
      const chosen = ["A", "B", "C", "D"].includes(String(userAnswers[id] || "").toUpperCase()) ? String(userAnswers[id]).toUpperCase() : "";
      const isCorrect = chosen === q.correct_option;
      if (isCorrect) score++;
      return {
        id: q.id, question_text: q.question_text,
        option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
        chosen, correct_option: q.correct_option, isCorrect, explanation: q.explanation || ""
      };
    }).filter(Boolean);

    const total = review.length || attempt.total_questions || 1;
    const accuracy = alreadyDone ? Number(attempt.accuracy_percent || 0) : Math.round((score / total) * 10000) / 100;
    const elapsed = alreadyDone ? Number(attempt.time_taken_sec || 1) : Math.max(1, Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000));

    if (!alreadyDone) {
      await supa(db.from("quiz_attempts").update({
        answers: userAnswers, score, total_questions: total, accuracy_percent: accuracy,
        time_taken_sec: elapsed, status: "completed", submitted_at: new Date().toISOString()
      }).eq("id", attempt.id));
    }

    const [rankRes] = await Promise.all([
      db.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("paper_id", attempt.paper_id).eq("status", "completed").gt("score", score),
      alreadyDone ? Promise.resolve() : notifyTelegramAdmin(`📝 <b>Mock Test Submitted</b>\n👤 <b>${escTg(attempt.user_name)}</b> (${escTg(attempt.user_city || "India")})\n📚 Paper: <b>${escTg(attempt.paper_id)}</b>\n🏆 Score: <b>${score}/${total}</b> (${accuracy}%)`)
    ]);
    const rank = Number(rankRes?.count || 0) + 1;
    res.json({ ok: true, score, total, accuracy, timeTakenSec: elapsed, rank, review });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/questions/:id/report", requireUser, async (req, res) => {
  try {
    const { data: q } = await supa(db.from("quiz_questions").select("id,paper_id,question_text,reported_count").eq("id", req.params.id).maybeSingle());
    if (!q) return res.status(404).json({ error: "Question not found." });
    await supa(db.from("quiz_questions").update({ reported_count: Number(q.reported_count || 0) + 1 }).eq("id", q.id));
    await notifyTelegramAdmin(`🚩 <b>Question Reported</b>\n📚 Paper: ${escTg(q.paper_id)}\n❓ ${escTg(q.question_text.slice(0, 180))}\n👤 By: ${escTg(req.user.email)}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});


// Student Profile Update -----------------------------------------------------
app.patch("/api/profile", requireUser, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 60);
    const state = String(req.body?.state || "").trim().slice(0, 60);
    const city = String(req.body?.city || "").trim().slice(0, 60);
    if (name.length < 2) return res.status(400).json({ error: "Enter a valid name." });
    const { data } = await supa(db.from("quiz_users").update({ name, state, city, updated_at: new Date().toISOString() }).eq("id", req.user.uid).select("*").single());
    res.json({ ok: true, user: safeUser(data) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Student Bookmarks (Paid Users Only) ----------------------------------------
async function userHasPaid(userId) {
  const { data } = await supa(db.from("quiz_payments").select("razorpay_order_id").eq("user_id", userId).eq("status", "paid").limit(1));
  return (data || []).length > 0;
}
app.get("/api/bookmarks", requireUser, async (req, res) => {
  try {
    if (!(await userHasPaid(req.user.uid))) {
      return res.status(403).json({ error: "Saved Questions is unlocked for paid plan users only.", requiresPlan: true });
    }
    const { data: bms } = await supa(db.from("quiz_bookmarks").select("question_id,paper_id,created_at").eq("user_id", req.user.uid).order("created_at", { ascending: false }).limit(100));
    const list = bms || [];
    if (!list.length) return res.json({ bookmarks: [] });
    const { data: qs } = await supa(db.from("quiz_questions").select("*").in("id", list.map(b => b.question_id)));
    const qMap = new Map((qs || []).map(q => [q.id, q]));
    res.json({ bookmarks: list.map(b => ({ ...qMap.get(b.question_id), savedAt: b.created_at })).filter(q => q?.id) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/bookmarks/:questionId", requireUser, async (req, res) => {
  try {
    if (!(await userHasPaid(req.user.uid))) {
      return res.status(403).json({ error: "Save Questions is a Pro feature. Buy any Paper Plan to unlock!", requiresPlan: true });
    }
    const { data: q } = await supa(db.from("quiz_questions").select("id,paper_id").eq("id", req.params.questionId).maybeSingle());
    if (!q) return res.status(404).json({ error: "Question not found." });
    await supa(db.from("quiz_bookmarks").upsert({ user_id: req.user.uid, question_id: q.id, paper_id: q.paper_id }, { onConflict: "user_id,question_id", ignoreDuplicates: true }));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.delete("/api/bookmarks/:questionId", requireUser, async (req, res) => {
  try {
    await supa(db.from("quiz_bookmarks").delete().eq("user_id", req.user.uid).eq("question_id", req.params.questionId));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Admin Auth & Overview ------------------------------------------------------
app.get("/api/admin/me", (req, res) => res.json({ authenticated: !!unsign(cookie(req, ADMIN_COOKIE))?.admin }));
app.post("/api/admin/login", (req, res) => {
  if (!rateAllowed(req, "admin-login", 8)) return res.status(429).json({ error: "Too many attempts." });
  const password = String(req.body?.password || "");
  const a = Buffer.from(password); const b = Buffer.from(ADMIN_PASSWORD);
  if (!ADMIN_PASSWORD || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Incorrect admin password." });
  appendCookie(res, ADMIN_COOKIE, sign({ admin: true, exp: Date.now() + 12 * 3600000 }), 12 * 3600);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (_req, res) => { clearCookie(res, ADMIN_COOKIE); res.json({ ok: true }); });

app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  try {
    const [uRes, pRes, qRes, aRes, payRes, settings] = await Promise.all([
      db.from("quiz_users").select("id", { count: "exact", head: true }),
      db.from("quiz_papers").select("id", { count: "exact", head: true }),
      db.from("quiz_questions").select("id", { count: "exact", head: true }),
      db.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supa(db.from("quiz_payments").select("amount").eq("status", "paid")),
      getSettings()
    ]);
    const revenue = money((payRes.data || []).reduce((s, r) => s + Number(r.amount || 0), 0));
    res.json({
      stats: {
        users: Number(uRes.count || 0), papers: Number(pRes.count || 0),
        questions: Number(qRes.count || 0), attempts: Number(aRes.count || 0),
        revenue, totalVisitors: settings.totalVisitors, todayVisitors: settings.todayVisitors
      },
      settings
    });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.get("/api/admin/papers", requireAdmin, async (_req, res) => {
  try {
    const [{ data: papers }, { data: qs }] = await Promise.all([
      supa(db.from("quiz_papers").select("*").order("created_at", { ascending: true })),
      supa(db.from("quiz_questions").select("paper_id"))
    ]);
    const counts = new Map();
    for (const q of qs || []) counts.set(q.paper_id, (counts.get(q.paper_id) || 0) + 1);
    res.json({ papers: (papers || []).map(p => ({ ...p, questionCount: counts.get(p.id) || 0 })) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/admin/papers", requireAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim().slice(0, 120);
    const category = String(req.body?.category || "HSSC").trim().slice(0, 40);
    const description = String(req.body?.description || "").trim().slice(0, 300);
    const duration = Math.max(1, Math.min(180, Math.floor(asNum(req.body?.durationMinutes, 15))));
    const qCount = Math.max(1, Math.min(100, Math.floor(asNum(req.body?.questionsPerAttempt, 25))));
    const price = money(Math.max(0, asNum(req.body?.priceInr, 25)));
    if (title.length < 3) return res.status(400).json({ error: "Enter a valid paper title." });
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `paper-${Date.now()}`;
    const { data } = await supa(db.from("quiz_papers").insert({
      id, title, category, description, duration_minutes: duration, questions_per_attempt: qCount, price_inr: price,
      sponsor_name: String(req.body?.sponsorName || "").trim().slice(0, 100),
      sponsor_tagline: String(req.body?.sponsorTagline || "").trim().slice(0, 160),
      sponsor_link: String(req.body?.sponsorLink || "").trim().slice(0, 200),
      active: true
    }).select("*").single());
    res.json({ ok: true, paper: data });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.patch("/api/admin/papers/:id", requireAdmin, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.active !== undefined) patch.active = req.body.active === true;
    if (req.body?.priceInr !== undefined) patch.price_inr = money(Math.max(0, asNum(req.body.priceInr, 25)));
    if (req.body?.sponsorName !== undefined) patch.sponsor_name = String(req.body.sponsorName).trim().slice(0, 100);
    if (req.body?.sponsorTagline !== undefined) patch.sponsor_tagline = String(req.body.sponsorTagline).trim().slice(0, 160);
    if (req.body?.sponsorLink !== undefined) patch.sponsor_link = String(req.body.sponsorLink).trim().slice(0, 200);
    await supa(db.from("quiz_papers").update(patch).eq("id", req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.delete("/api/admin/papers/:id", requireAdmin, async (req, res) => {
  try { await supa(db.from("quiz_papers").delete().eq("id", req.params.id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: errorText(e) }); }
});

// Admin Question Bank & AI Agent Generator -----------------------------------
function normQText(t) {
  return String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function extractJsonArray(rawText) {
  let s = String(rawText || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  // Partial recovery: extract all complete {...} objects even if response was truncated
  const objs = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = Math.max(0, start); i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { objs.push(JSON.parse(s.slice(objStart, i + 1))); } catch {}
        objStart = -1;
      }
    }
  }
  if (objs.length) return objs;
  throw new Error("AI response did not contain valid JSON questions.");
}

async function callAiAgent({ provider, apiKey, model, prompt }) {
  if (provider === "gemini") {
    const m = model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
      }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  const endpoints = {
    openai: { url: "https://api.openai.com/v1/chat/completions", model: model || "gpt-4o-mini" },
    groq: { url: "https://api.groq.com/openai/v1/chat/completions", model: model || "llama-3.3-70b-versatile" },
    openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", model: model || "google/gemini-2.0-flash-001" }
  };
  const cfg = endpoints[provider];
  if (!cfg) throw new Error("Unsupported AI provider. Choose Gemini, OpenAI, Groq, or OpenRouter.");
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "system", content: "You are an expert Indian competitive exam question author. Output ONLY a valid JSON array." }, { role: "user", content: prompt }],
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(45000)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `${provider} HTTP ${r.status}`);
  return data?.choices?.[0]?.message?.content || "";
}

app.post("/api/admin/questions/ai-generate", requireAdmin, async (req, res) => {
  try {
    const paperId = String(req.body?.paperId || "").trim();
    const provider = String(req.body?.provider || "gemini").trim().toLowerCase();
    const apiKey = String(req.body?.apiKey || "").trim();
    const model = String(req.body?.model || "").trim();
    const topic = String(req.body?.topic || "Full Syllabus").trim().slice(0, 120);
    const language = String(req.body?.language || "Bilingual (English + Hindi)").trim().slice(0, 60);
    const difficulty = ["easy", "medium", "hard"].includes(req.body?.difficulty) ? req.body.difficulty : "medium";
    const count = Math.max(1, Math.min(35, Math.floor(asNum(req.body?.count, 10))));

    if (!paperId || !apiKey) return res.status(400).json({ error: "Select a paper and enter your AI API key." });
    const { data: paper } = await supa(db.from("quiz_papers").select("*").eq("id", paperId).maybeSingle());
    if (!paper) return res.status(404).json({ error: "Paper not found." });

    const prompt = `Generate ${count} unique, accurate multiple-choice questions for the Indian exam "${paper.title}" (${paper.category}).
Topic focus: ${topic}.
Language: ${language}.
Difficulty: ${difficulty}.
Return ONLY a JSON array of objects, each with exact keys:
"question_text", "option_a", "option_b", "option_c", "option_d", "correct_option" ("A","B","C", or "D"), "explanation", "topic".`;

    const raw = await callAiAgent({ provider, apiKey, model, prompt });
    const parsed = extractJsonArray(raw);

    const { data: existing } = await supa(db.from("quiz_questions").select("question_text").eq("paper_id", paperId).limit(2000));
    const seenTexts = new Set((existing || []).map(x => normQText(x.question_text)));

    const rows = [];
    for (const item of parsed) {
      const qt = String(item?.question_text || "").trim();
      const oa = String(item?.option_a || "").trim();
      const ob = String(item?.option_b || "").trim();
      const oc = String(item?.option_c || "").trim();
      const od = String(item?.option_d || "").trim();
      const co = String(item?.correct_option || "").trim().toUpperCase();
      if (!qt || !oa || !ob || !oc || !od || !["A", "B", "C", "D"].includes(co)) continue;
      const nq = normQText(qt);
      if (!nq || seenTexts.has(nq)) continue;
      seenTexts.add(nq);
      rows.push({
        paper_id: paperId, question_text: qt, option_a: oa, option_b: ob, option_c: oc, option_d: od,
        correct_option: co, explanation: String(item?.explanation || "").trim().slice(0, 600),
        topic: String(item?.topic || topic).trim().slice(0, 60), difficulty, active: true
      });
    }
    if (!rows.length) return res.status(422).json({ error: "No new unique valid questions returned by AI. Try again or change topic." });
    await supa(db.from("quiz_questions").insert(rows));
    res.json({ ok: true, inserted: rows.length, skippedDuplicates: parsed.length - rows.length });
  } catch (e) { res.status(400).json({ error: errorText(e) }); }
});

app.post("/api/admin/questions/bulk", requireAdmin, async (req, res) => {
  try {
    const paperId = String(req.body?.paperId || "").trim();
    const list = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (!paperId || !list.length) return res.status(400).json({ error: "Paper ID and questions array required." });
    const rows = [];
    for (const item of list.slice(0, 500)) {
      const qt = String(item?.question_text || "").trim();
      const oa = String(item?.option_a || "").trim();
      const ob = String(item?.option_b || "").trim();
      const oc = String(item?.option_c || "").trim();
      const od = String(item?.option_d || "").trim();
      const co = String(item?.correct_option || "").trim().toUpperCase();
      if (!qt || !oa || !ob || !oc || !od || !["A", "B", "C", "D"].includes(co)) continue;
      rows.push({
        paper_id: paperId, question_text: qt, option_a: oa, option_b: ob, option_c: oc, option_d: od,
        correct_option: co, explanation: String(item?.explanation || "").trim().slice(0, 600),
        topic: String(item?.topic || "General").trim().slice(0, 60),
        difficulty: ["easy", "medium", "hard"].includes(item?.difficulty) ? item.difficulty : "medium", active: true
      });
    }
    if (!rows.length) return res.status(400).json({ error: "No valid questions found in JSON." });
    await supa(db.from("quiz_questions").insert(rows));
    res.json({ ok: true, inserted: rows.length });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.get("/api/admin/questions", requireAdmin, async (req, res) => {
  try {
    const paperId = String(req.query?.paperId || "").trim();
    let q = db.from("quiz_questions").select("*").order("created_at", { ascending: false }).limit(200);
    if (paperId) q = q.eq("paper_id", paperId);
    const { data } = await supa(q);
    res.json({ questions: data || [] });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.delete("/api/admin/questions/:id", requireAdmin, async (req, res) => {
  try { await supa(db.from("quiz_questions").delete().eq("id", req.params.id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("quiz_users").select("*").order("created_at", { ascending: false }).limit(150));
    res.json({ users: (data || []).map(safeUser) });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.patch("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
  try {
    await supa(db.from("quiz_users").update({ disabled: req.body?.disabled === true, updated_at: new Date().toISOString() }).eq("id", req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.post("/api/admin/users/:id/credits", requireAdmin, async (req, res) => {
  try {
    const delta = Math.trunc(asNum(req.body?.delta, 0));
    if (!delta || Math.abs(delta) > 1000) return res.status(400).json({ error: "Enter a valid non-zero credit change." });
    const { data: u } = await supa(db.from("quiz_users").select("id,paper_credits").eq("id", req.params.id).maybeSingle());
    if (!u) return res.status(404).json({ error: "Student not found." });
    const nextCredits = Math.max(0, Number(u.paper_credits || 0) + delta);
    await supa(db.from("quiz_users").update({ paper_credits: nextCredits, updated_at: new Date().toISOString() }).eq("id", u.id));
    res.json({ ok: true, paperCredits: nextCredits });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.get("/api/admin/attempts", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("quiz_attempts").select("*").eq("status", "completed").order("submitted_at", { ascending: false }).limit(200));
    res.json({ attempts: data || [] });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    await supa(db.from("quiz_settings").upsert({
      id: "main",
      site_name: String(req.body?.siteName || SITE_NAME).trim().slice(0, 60),
      free_papers_per_device: Math.max(0, Math.min(10, Math.floor(asNum(req.body?.freePapersPerDevice, 1)))),
      default_paper_price: money(Math.max(0, asNum(req.body?.defaultPaperPrice, 25))),
      announcement_enabled: req.body?.announcementEnabled === true,
      announcement_text: String(req.body?.announcementText || "").trim().slice(0, 300),
      updated_at: new Date().toISOString()
    }, { onConflict: "id" }));
    res.json({ ok: true, settings: await getSettings() });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});


// Admin Paper Plans CRUD -----------------------------------------------------
app.get("/api/admin/plans", requireAdmin, async (_req, res) => {
  try {
    const { data } = await supa(db.from("quiz_plans").select("*").order("sort_order", { ascending: true }).order("price_inr", { ascending: true }));
    res.json({ plans: data || [] });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.post("/api/admin/plans", requireAdmin, async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim().slice(0, 80);
    const papersCount = Math.max(1, Math.min(500, Math.floor(asNum(req.body?.papersCount, 1))));
    const priceInr = money(Math.max(1, asNum(req.body?.priceInr, 25)));
    const badge = String(req.body?.badge || "").trim().slice(0, 40);
    const sortOrder = Math.floor(asNum(req.body?.sortOrder, papersCount));
    if (title.length < 2) return res.status(400).json({ error: "Enter a plan title." });
    const id = `plan-${papersCount}-${Date.now().toString().slice(-4)}`;
    const { data } = await supa(db.from("quiz_plans").insert({ id, title, papers_count: papersCount, price_inr: priceInr, badge, sort_order: sortOrder, active: true }).select("*").single());
    res.json({ ok: true, plan: data });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.patch("/api/admin/plans/:id", requireAdmin, async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.active !== undefined) patch.active = req.body.active === true;
    if (req.body?.priceInr !== undefined) patch.price_inr = money(Math.max(1, asNum(req.body.priceInr, 25)));
    if (req.body?.papersCount !== undefined) patch.papers_count = Math.max(1, Math.floor(asNum(req.body.papersCount, 1)));
    await supa(db.from("quiz_plans").update(patch).eq("id", req.params.id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: errorText(e) }); }
});
app.delete("/api/admin/plans/:id", requireAdmin, async (req, res) => {
  try { await supa(db.from("quiz_plans").delete().eq("id", req.params.id)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: errorText(e) }); }
});

module.exports = app;

