import React, { useEffect, useState } from "react";
import { api, getDeviceMeta, markFreeUsed } from "./api.js";
import { isSoundEnabled, setSoundEnabled } from "./sound.js";
import AuthModal from "./components/AuthModal.jsx";
import PlansModal from "./components/PlansModal.jsx";
import QuizRunner from "./components/QuizRunner.jsx";
import ResultView from "./components/ResultView.jsx";
import AdminPanel from "./components/AdminPanel.jsx";

const CACHE_KEY = "yaadpage_swr_v1";
const STATES_IN = ["Haryana", "Delhi", "Rajasthan", "Uttar Pradesh", "Punjab", "Himachal Pradesh", "Uttarakhand", "Madhya Pradesh", "Bihar", "Maharashtra", "Gujarat", "Other"];
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ...payload })); } catch {}
}

export default function App() {
  const cached = readCache();
  const [isAdmin, setIsAdmin] = useState(() => location.pathname.startsWith("/admin"));
  const [loading, setLoading] = useState(() => !cached?.papers?.length);
  const [config, setConfig] = useState(() => cached?.config || null);
  const [user, setUser] = useState(() => cached?.user || null);
  const [papers, setPapers] = useState(() => cached?.papers || []);
  const [plans, setPlans] = useState(() => cached?.plans || []);
  const [attempts, setAttempts] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbPaperId, setLbPaperId] = useState(() => cached?.papers?.[0]?.id || "");
  const [tab, setTab] = useState("tests");
  const [cat, setCat] = useState("all");
  const [paperSearch, setPaperSearch] = useState("");
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "light");
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [authModal, setAuthModal] = useState(null);
  const [showPlans, setShowPlans] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [result, setResult] = useState(null);
  const [startingPaperId, setStartingPaperId] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [toastState, setToastState] = useState({ msg: "", kind: "", show: false });

  function toast(msg, kind = "") {
    setToastState({ msg, kind, show: true });
    setTimeout(() => setToastState(prev => ({ ...prev, show: false })), 3400);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("quiz_theme", next); } catch {}
    document.getElementById("themeColorMeta")?.setAttribute("content", next === "dark" ? "#070b14" : "#f8fafc");
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    toast(next ? "Result sound enabled 🔊" : "Sound muted 🔇");
  }

  async function refreshData() {
    const dm = getDeviceMeta();
    const [cfgRes, papersRes, plansRes, meRes] = await Promise.allSettled([
      api(`/api/public/config?deviceId=${encodeURIComponent(dm.deviceId)}&deviceFp=${encodeURIComponent(dm.deviceFp)}`),
      api("/api/papers"),
      api("/api/plans"),
      api("/api/auth/me")
    ]);
    const nextCfg = cfgRes.status === "fulfilled" ? cfgRes.value : config;
    const nextPapers = papersRes.status === "fulfilled" ? (papersRes.value.papers || []) : papers;
    const nextPlans = plansRes.status === "fulfilled" ? (plansRes.value.plans || []) : plans;
    const nextUser = meRes.status === "fulfilled" ? (meRes.value.authenticated ? meRes.value.user : null) : user;

    if (nextCfg) setConfig(nextCfg);
    if (nextPapers) setPapers(nextPapers);
    if (nextPlans) setPlans(nextPlans);
    setUser(nextUser);
    if (!lbPaperId && nextPapers.length) setLbPaperId(nextPapers[0].id);
    writeCache({ config: nextCfg, papers: nextPapers, plans: nextPlans, user: nextUser });

    if (nextUser) {
      const jobs = [api("/api/attempts")];
      if (nextUser.isPaidUser) jobs.push(api("/api/bookmarks"));
      Promise.allSettled(jobs).then(([attR, bmR]) => {
        if (attR?.status === "fulfilled") setAttempts(attR.value.attempts || []);
        if (bmR?.status === "fulfilled") setBookmarks(bmR.value.bookmarks || []);
      });
    } else {
      setAttempts([]);
      setBookmarks([]);
    }
  }

  useEffect(() => {
    refreshData().finally(() => setLoading(false));
    try {
      if (!sessionStorage.getItem("quiz_visited")) {
        sessionStorage.setItem("quiz_visited", "1");
        fetch("/api/public/visit", { method: "POST" }).catch(() => {});
      }
    } catch {}
    const onPop = () => setIsAdmin(location.pathname.startsWith("/admin"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (tab === "leaderboard" && lbPaperId) {
      api(`/api/papers/${encodeURIComponent(lbPaperId)}/leaderboard`).then(r => setLeaderboard(r.leaderboard || [])).catch(() => {});
    }
    if (tab === "saved" && user?.isPaidUser) {
      api("/api/bookmarks").then(r => setBookmarks(r.bookmarks || [])).catch(() => {});
    }
  }, [tab, lbPaperId]);

  async function startPaper(paperId) {
    if (!user) {
      setAuthModal({ mode: "login", after: () => startPaper(paperId) });
      return;
    }
    if (startingPaperId) return;
    setStartingPaperId(paperId);
    try {
      const dm = getDeviceMeta();
      const res = await api("/api/attempts/start", { method: "POST", body: JSON.stringify({ paperId, ...dm }) });
      if (res.isFree) markFreeUsed();
      setResult(null);
      setActiveQuiz(res);
      refreshData();
    } catch (err) {
      if (err.status === 402 && err.data?.requiresPlan) {
        setShowPlans(true);
      } else {
        toast(err.message, "error");
      }
    } finally { setStartingPaperId(""); }
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await api("/api/profile", { method: "PATCH", body: JSON.stringify(fd) });
      await refreshData();
      toast("Profile updated!", "success");
    } catch (err) { toast(err.message, "error"); }
    finally { setSavingProfile(false); }
  }

  if (isAdmin) {
    return (
      <>
        <AdminPanel toast={toast} onExit={() => { history.pushState({}, "", "/"); setIsAdmin(false); refreshData(); }} />
        <div className={`toast ${toastState.show ? "show" : ""} ${toastState.kind}`}>{toastState.msg}</div>
      </>
    );
  }

  if (loading) {
    return <div className="boot"><span className="logo-mark">Y</span><span className="spinner" /><p>Opening YaadPage…</p></div>;
  }

  const siteName = config?.siteName || "YaadPage";
  const freeOk = config?.freeEligible;
  const credits = Number(user?.paperCredits || 0);
  const isPaidUser = Boolean(user?.isPaidUser);
  const cats = ["all", ...new Set(papers.map(p => p.category || "Other"))];
  const q = paperSearch.trim().toLowerCase();
  const visiblePapers = papers.filter(p => {
    const matchCat = cat === "all" || (p.category || "Other") === cat;
    const matchQ = !q || `${p.title} ${p.category} ${p.description || ""}`.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" onClick={e => { e.preventDefault(); setResult(null); setActiveQuiz(null); setTab("tests"); }}>
            <span className="logo-mark">Y</span>
            <div><b>{siteName}</b><small>SMART MOCK PORTAL</small></div>
          </a>

          {!activeQuiz && (
            <nav className="top-nav">
              <button className={tab === "tests" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("tests"); }}>Mock Tests</button>
              <button className={tab === "plans" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("plans"); }}>Plans</button>
              <button className={tab === "leaderboard" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("leaderboard"); }}>Leaderboard</button>
              <button className={tab === "attempts" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("attempts"); }}>My Scores</button>
              <button className={tab === "saved" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("saved"); }}>Saved ⭐</button>
              <button className={tab === "profile" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("profile"); }}>Profile</button>
            </nav>
          )}

          <div className="top-actions">
            {user && (
              <button className="credit-pill" onClick={() => setShowPlans(true)} title="Buy more paper credits">
                🎟 <b>{credits}</b> <span>{credits === 1 ? "Credit" : "Credits"}</span>
              </button>
            )}
            <button className="icon-btn" onClick={toggleSound} aria-label="Toggle sound" title="Toggle result sound">
              {soundOn ? "🔊" : "🔇"}
            </button>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title="Switch Light/Dark">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {user ? (
              <button className="btn btn-outline btn-sm" onClick={() => { setResult(null); setTab("profile"); }}>
                {user.name.split(" ")[0]}
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setAuthModal({ mode: "login" })}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {config?.announcement?.enabled && config?.announcement?.text && (
          <div className="notice-banner">📢 {config.announcement.text}</div>
        )}

        {activeQuiz ? (
          <QuizRunner quiz={activeQuiz} isPaidUser={isPaidUser} onRequirePlan={() => setShowPlans(true)} toast={toast} onSubmitted={res => { setActiveQuiz(null); setResult(res); refreshData(); }} />
        ) : result ? (
          <ResultView result={result} siteName={siteName} isPaidUser={isPaidUser} onRequirePlan={() => setShowPlans(true)} toast={toast} onBack={() => { setResult(null); setTab("tests"); }} />
        ) : tab === "plans" ? (
          <section className="fade-in">
            <div className="section-head">
              <div><span className="eyebrow">TRANSPARENT PRICING</span><h1>Choose Your Mock Test Pack</h1><p className="muted-sm">Buy credits once and unlock <b>Saved Questions ⭐</b> + non-repeating mock tests across any exam.</p></div>
            </div>
            <div className="plans-grid">
              {plans.map(plan => {
                const per = (plan.priceInr / Math.max(1, plan.papersCount)).toFixed(0);
                const pop = plan.papersCount === 5 || /popular|best/i.test(plan.badge);
                return (
                  <article key={plan.id} className={`plan-card ${pop ? "featured" : ""}`}>
                    {plan.badge && <span className="plan-badge">{plan.badge}</span>}
                    <h3>{plan.title}</h3>
                    <div className="plan-price"><b>₹{plan.priceInr}</b><span>/ {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"}</span></div>
                    <small className="plan-unit">Only ₹{per} per mock test · Never expires</small>
                    <button className={`btn ${pop ? "btn-primary" : "btn-outline"} full`} onClick={() => user ? setShowPlans(true) : setAuthModal({ mode: "login", after: () => setShowPlans(true) })}>
                      Select {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"} →
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : tab === "leaderboard" ? (
          <section className="fade-in">
            <div className="section-head">
              <div><span className="eyebrow">RANKINGS</span><h1>Top Performers 🏆</h1></div>
              <select className="ctrl" style={{ maxWidth: 280 }} value={lbPaperId} onChange={e => setLbPaperId(e.target.value)}>
                {papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Student</th><th>City</th><th>Score</th><th>Accuracy</th><th>Time</th></tr></thead><tbody>
              {leaderboard.map((r, i) => (
                <tr key={i}><td><b>#{i + 1}</b></td><td><b>{r.user_name}</b></td><td>{r.user_city || "—"}</td><td><b>{r.score}/{r.total_questions}</b></td><td>{r.accuracy_percent}%</td><td>{Math.floor((r.time_taken_sec || 0) / 60)}m {(r.time_taken_sec || 0) % 60}s</td></tr>
              ))}
              {!leaderboard.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24 }}>No completed attempts yet.</td></tr>}
            </tbody></table></div>
          </section>
        ) : tab === "saved" ? (
          <section className="fade-in">
            {!user ? (
              <div className="panel" style={{ textAlign: "center", padding: 36 }}>
                <h2>Sign in to view Saved Questions</h2>
                <p className="muted-sm" style={{ margin: "8px 0 16px" }}>Bookmark tricky questions during tests for quick revision before exams.</p>
                <button className="btn btn-primary" onClick={() => setAuthModal({ mode: "login" })}>Sign In →</button>
              </div>
            ) : !isPaidUser ? (
              <div className="panel" style={{ textAlign: "center", padding: 36 }}>
                <span className="eyebrow">PRO FEATURE 🔒</span>
                <h2>Saved Questions is for Paid Users</h2>
                <p className="muted-sm" style={{ margin: "8px 0 18px" }}>Buy any Paper Pack (starting at ₹25) to unlock unlimited question bookmarking and revision bank.</p>
                <button className="btn btn-primary" onClick={() => setShowPlans(true)}>Unlock with Paper Plan →</button>
              </div>
            ) : (
              <>
                <div className="section-head"><div><span className="eyebrow">REVISION BANK</span><h1>Saved Questions ⭐ ({bookmarks.length})</h1></div></div>
                <div className="stack">
                  {bookmarks.map((qItem, i) => (
                    <article key={qItem.id} className="review-card ok">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div className="review-q">{i + 1}. {qItem.question_text}</div>
                        <button className="btn btn-outline btn-sm" onClick={async () => { await api(`/api/bookmarks/${encodeURIComponent(qItem.id)}`, { method: "DELETE" }); setBookmarks(b => b.filter(x => x.id !== qItem.id)); toast("Removed."); }}>Remove</button>
                      </div>
                      <div className="review-ans">Correct Answer: <b className="text-green">{qItem.correct_option} ({qItem[`option_${String(qItem.correct_option || "a").toLowerCase()}`]})</b></div>
                      {qItem.explanation && <div className="explain">💡 {qItem.explanation}</div>}
                    </article>
                  ))}
                  {!bookmarks.length && <div className="panel" style={{ textAlign: "center", padding: 28 }}>No saved questions yet. Tap <b>☆ Save</b> during any test or review!</div>}
                </div>
              </>
            )}
          </section>
        ) : tab === "profile" ? (
          <section className="fade-in">
            {!user ? (
              <div className="panel" style={{ textAlign: "center", padding: 36 }}>
                <h2>Sign in to manage your Profile</h2>
                <p className="muted-sm" style={{ margin: "8px 0 16px" }}>Set your State &amp; District, check Paper Credits, and manage your account.</p>
                <button className="btn btn-primary" onClick={() => setAuthModal({ mode: "login" })}>Sign In / Create Account →</button>
              </div>
            ) : (
              <div className="grid-2">
                <div className="panel">
                  <span className="eyebrow">MY PROFILE</span>
                  <h2 style={{ marginBottom: 14 }}>Personal &amp; Location Details</h2>
                  <form className="stack" onSubmit={saveProfile}>
                    <label className="field"><span>Full Name</span><input className="ctrl" name="name" defaultValue={user.name} required /></label>
                    <label className="field"><span>Email Address</span><input className="ctrl" value={user.email} disabled /></label>
                    <label className="field"><span>State</span>
                      <select className="ctrl" name="state" defaultValue={user.state || ""}>
                        <option value="">Select your State</option>
                        {STATES_IN.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>District / City</span><input className="ctrl" name="city" defaultValue={user.city || ""} placeholder="e.g. Bhiwani, Rohtak, Hisar" /></label>
                    <button className="btn btn-primary" type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save Profile ✓"}</button>
                  </form>
                </div>
                <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <span className="eyebrow">ACCOUNT STATUS</span>
                    <h2 style={{ marginBottom: 12 }}>Credits &amp; Plan</h2>
                    <div className="kpi-grid">
                      <div className="kpi"><span>Paper Credits</span><b>{credits}</b><small>Available tests</small></div>
                      <div className="kpi"><span>Account Tier</span><b>{isPaidUser ? "PRO ⭐" : "FREE"}</b><small>{isPaidUser ? "Saved Questions unlocked" : "Buy a plan for Pro"}</small></div>
                    </div>
                  </div>
                  <div className="stack">
                    <button className="btn btn-primary full" onClick={() => setShowPlans(true)}>Buy More Paper Credits →</button>
                    <button className="btn btn-outline full" style={{ color: "var(--red)" }} onClick={async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); setAttempts([]); setBookmarks([]); setTab("tests"); toast("Logged out."); }}>Logout</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : tab === "attempts" ? (
          <section className="fade-in">
            {!user ? (
              <div className="panel" style={{ textAlign: "center", padding: 36 }}>
                <h2>Sign in to view your scores</h2>
                <p className="muted-sm" style={{ margin: "8px 0 16px" }}>Track all your mock test attempts, accuracy, and paper credits.</p>
                <button className="btn btn-primary" onClick={() => setAuthModal({ mode: "login" })}>Sign In / Create Account →</button>
              </div>
            ) : (
              <>
                <div className="section-head"><div><span className="eyebrow">HISTORY</span><h1>My Mock Test Scores</h1></div></div>
                <div className="table-wrap"><table><thead><tr><th>Paper</th><th>Score</th><th>Accuracy</th><th>Mode</th><th>Date</th></tr></thead><tbody>
                  {attempts.map(a => (
                    <tr key={a.id}><td><b>{a.paper_id}</b></td><td><b>{a.score}/{a.total_questions}</b></td><td>{a.accuracy_percent}%</td><td>{a.is_free ? "Free" : "Credit"}</td><td>{new Date(a.submitted_at || a.started_at).toLocaleString("en-IN")}</td></tr>
                  ))}
                  {!attempts.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 24 }}>You haven't completed any mock test yet.</td></tr>}
                </tbody></table></div>
              </>
            )}
          </section>
        ) : (
          <div className="fade-in">
            <section className="hero-bento">
              <div className="hero-copy">
                <span className="hero-pill">{freeOk ? "🎁 1ST MOCK PAPER FREE" : credits > 0 ? `🎟 ${credits} PAPER CREDITS READY` : "⚡ SMART EXAM PREP"}</span>
                <h1>Crack Govt &amp; Board Exams on <em>{siteName}</em></h1>
                <p>Every attempt draws 25 fresh non-repeating questions with live ranking, result sound celebration &amp; detailed solutions.</p>
                <div className="hero-cta">
                  <button className="btn btn-white btn-lg" onClick={() => papers[0] && startPaper(papers[0].id)}>
                    {freeOk ? "Start 1st Free Test →" : "Start Mock Test →"}
                  </button>
                  <button className="btn btn-glass btn-lg" onClick={() => setTab("plans")}>View Paper Plans</button>
                </div>
              </div>
              <div className="hero-stats-box">
                <div><span>1ST TEST</span><b>FREE</b><small>Per device</small></div>
                <div><span>PACKS FROM</span><b>₹6.6</b><small>Per paper</small></div>
                <div><span>DURATION</span><b>15m</b><small>25 Random Qs</small></div>
                <div><span>INSTANT</span><b>RANK</b><small>+ Revision Bank</small></div>
              </div>
            </section>

            <div className="papers-toolbar">
              <div className="cat-bar" style={{ padding: 0 }}>
                {cats.map(c => (
                  <button key={c} className={`cat-chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
                    {c === "all" ? "All Exams" : c}
                  </button>
                ))}
              </div>
              <input className="ctrl paper-search" type="search" placeholder="🔍 Search exam paper…" value={paperSearch} onChange={e => setPaperSearch(e.target.value)} />
            </div>

            <div className="papers-grid compact-grid">
              {visiblePapers.map(p => {
                const canStartFree = freeOk;
                const hasCreds = credits > 0;
                const statusBadge = canStartFree ? "1st Free" : hasCreds ? "1 Credit" : `From ₹${Math.min(...(plans.length ? plans.map(x => x.priceInr) : [25]))}`;
                return (
                  <article key={p.id} className="paper-card compact-card">
                    <div className="card-top">
                      <span className="pill">{p.category}</span>
                      <span className={`pill ${canStartFree || hasCreds ? "good" : ""}`}>{statusBadge}</span>
                    </div>
                    <h3>{p.title}</h3>
                    <div className="meta-row">
                      <span>⏱ {p.durationMinutes}m</span>
                      <span>❓ {p.questionsPerAttempt} Qs</span>
                      <span>📚 {p.totalBankQuestions} Bank</span>
                    </div>
                    {p.sponsorName && (
                      <div className="sponsor-box">
                        <span>By <b>{p.sponsorName}</b></span>
                        {p.sponsorLink && <a href={p.sponsorLink} target="_blank" rel="noopener noreferrer">Visit →</a>}
                      </div>
                    )}
                    <button className="btn btn-primary btn-sm full" style={{ marginTop: "auto" }} disabled={p.totalBankQuestions === 0 || startingPaperId === p.id} onClick={() => startPaper(p.id)}>
                      {startingPaperId === p.id ? <><span className="spinner" /> Starting…</> : p.totalBankQuestions === 0 ? "Coming Soon" : canStartFree ? "Start Free →" : hasCreds ? "Start (1 Credit) →" : "Unlock Plan →"}
                    </button>
                  </article>
                );
              })}
              {!visiblePapers.length && <div className="panel" style={{ gridColumn: "1/-1", textAlign: "center" }}>No matching exam papers found.</div>}
            </div>
          </div>
        )}
      </main>

      {!activeQuiz && (
        <nav className="mobile-dock" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          <button className={tab === "tests" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("tests"); }}>Tests</button>
          <button className={tab === "plans" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("plans"); }}>Plans</button>
          <button className={tab === "leaderboard" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("leaderboard"); }}>Ranks</button>
          <button className={tab === "saved" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("saved"); }}>Saved ⭐</button>
          <button className={tab === "profile" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("profile"); }}>Profile</button>
        </nav>
      )}

      {authModal && <AuthModal config={config} initialMode={authModal.mode} toast={toast} onClose={() => setAuthModal(null)} onSuccess={async () => { const fn = authModal.after; setAuthModal(null); await refreshData(); if (fn) fn(); }} />}
      {showPlans && <PlansModal plans={plans} config={config} user={user} toast={toast} onClose={() => setShowPlans(false)} onPurchased={async () => { setShowPlans(false); await refreshData(); }} />}
      <div className={`toast ${toastState.show ? "show" : ""} ${toastState.kind}`}>{toastState.msg}</div>
    </div>
  );
}
