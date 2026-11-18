import React, { useEffect, useState } from "react";
import { api, getDeviceMeta, markFreeUsed } from "./api.js";
import { isSoundEnabled, setSoundEnabled } from "./sound.js";
import AuthModal from "./components/AuthModal.jsx";
import PlansModal from "./components/PlansModal.jsx";
import QuizRunner from "./components/QuizRunner.jsx";
import ResultView from "./components/ResultView.jsx";
import AdminPanel from "./components/AdminPanel.jsx";

const CACHE_KEY = "yaadpage_swr_v1";
const STATES_IN = [
  "Haryana", "Delhi", "Rajasthan", "Uttar Pradesh", "Punjab",
  "Himachal Pradesh", "Uttarakhand", "Madhya Pradesh", "Bihar",
  "Maharashtra", "Gujarat", "Other"
];

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ...payload })); } catch {}
}

/* Crisp inline SVG icon set */
const Icon = {
  Tests: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  Plans: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Trophy: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  Scores: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
  Bookmark: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  ),
  User: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Help: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
    </svg>
  ),
  Layers: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Ticket: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
    </svg>
  ),
  VolumeOn: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  VolumeOff: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  ),
  Sun: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ),
  Moon: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  ),
  Check: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Lock: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
};

function getInitials(name = "S") {
  return String(name).trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || "").join("") || "S";
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
    document.getElementById("themeColorMeta")?.setAttribute("content", next === "dark" ? "#0b0f19" : "#f8fafc");
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    toast(next ? "Result sound enabled" : "Sound muted");
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
    if (!config?.freeEligible && Number(user?.paperCredits || 0) <= 0) {
      setShowPlans(true);
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
      toast("Profile updated successfully!", "success");
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
    return (
      <div className="boot">
        <span className="logo-mark">Y</span>
        <span className="spinner dark" />
        <p>Loading YaadPage…</p>
      </div>
    );
  }

  const siteName = config?.siteName || "YaadPage";
  const freeOk = config?.freeEligible;
  const credits = Number(user?.paperCredits || 0);
  const isPaidUser = Boolean(user?.isPaidUser);
  const cats = ["all", ...new Set(papers.map(p => p.category || "Other"))];
  const paperTitleMap = Object.fromEntries(papers.map(p => [p.id, p.title]));
  const q = paperSearch.trim().toLowerCase();
  const visiblePapers = papers.filter(p => {
    const matchCat = cat === "all" || (p.category || "Other") === cat;
    const matchQ = !q || `${p.title} ${p.category} ${p.description || ""}`.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const minPlanPrice = plans.length ? Math.min(...plans.map(x => Number(x.priceInr || 25))) : 25;
  const avgAccuracy = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + Number(a.accuracy_percent || 0), 0) / attempts.length)
    : 0;
  const bestAccuracy = attempts.length
    ? Math.max(...attempts.map(a => Number(a.accuracy_percent || 0)))
    : 0;

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" onClick={e => { e.preventDefault(); setResult(null); setActiveQuiz(null); setTab("tests"); }}>
            <span className="logo-mark">Y</span>
            <div>
              <b>{siteName}</b>
              <small>MOCK TEST PORTAL</small>
            </div>
          </a>

          {!activeQuiz && (
            <nav className="top-nav" aria-label="Primary">
              <button className={tab === "tests" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("tests"); }}>
                <Icon.Tests /> <span>Mock Tests</span>
              </button>
              <button className={tab === "plans" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("plans"); }}>
                <Icon.Plans /> <span>Plans</span>
              </button>
              <button className={tab === "leaderboard" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("leaderboard"); }}>
                <Icon.Trophy /> <span>Leaderboard</span>
              </button>
              <button className={tab === "attempts" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("attempts"); }}>
                <Icon.Scores /> <span>My Scores</span>
              </button>
              <button className={tab === "saved" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("saved"); }}>
                <Icon.Bookmark /> <span>Saved</span>
              </button>
            </nav>
          )}

          <div className="top-actions">
            {user && (
              <button className="credit-pill" onClick={() => setShowPlans(true)} title="Buy more paper credits">
                <Icon.Ticket />
                <b>{credits}</b>
                <span className="hide-xs">{credits === 1 ? "Credit" : "Credits"}</span>
                <span className="credit-plus">+</span>
              </button>
            )}
            <button className="icon-btn" onClick={toggleSound} aria-label="Toggle sound" title={soundOn ? "Mute result sound" : "Enable result sound"}>
              {soundOn ? <Icon.VolumeOn /> : <Icon.VolumeOff />}
            </button>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title="Switch Light/Dark theme">
              {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
            </button>
            {user ? (
              <button
                className={`user-chip ${tab === "profile" && !result ? "active" : ""}`}
                onClick={() => { setResult(null); setTab("profile"); }}
                title="Open Profile"
              >
                <span className="avatar-xs">{getInitials(user.name)}</span>
                <span className="user-chip-name">{user.name.split(" ")[0]}</span>
                {isPaidUser && <span className="pro-tag">PRO</span>}
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setAuthModal({ mode: "login" })}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {config?.announcement?.enabled && config?.announcement?.text && (
          <div className="notice-banner">
            <span className="notice-dot" />
            <span>{config.announcement.text}</span>
          </div>
        )}

        {activeQuiz ? (
          <QuizRunner
            quiz={activeQuiz}
            isPaidUser={isPaidUser}
            onRequirePlan={() => setShowPlans(true)}
            toast={toast}
            onSubmitted={res => { setActiveQuiz(null); setResult(res); refreshData(); }}
          />
        ) : result ? (
          <ResultView
            result={result}
            siteName={siteName}
            isPaidUser={isPaidUser}
            onRequirePlan={() => setShowPlans(true)}
            toast={toast}
            onBack={() => { setResult(null); setTab("tests"); }}
          />
        ) : tab === "plans" ? (
          <section className="fade-in">
            <div className="section-head">
              <div>
                <span className="eyebrow">TRANSPARENT PRICING</span>
                <h1>Choose Your Mock Test Pack</h1>
                <p className="muted-sm">Buy credits once — unlock <b>Saved Questions</b>, non-repeating random papers &amp; lifetime valid credits.</p>
              </div>
            </div>
            <div className="plans-grid">
              {plans.map(plan => {
                const per = (plan.priceInr / Math.max(1, plan.papersCount)).toFixed(0);
                const pop = plan.papersCount === 5 || /popular|best/i.test(plan.badge);
                return (
                  <article key={plan.id} className={`plan-card ${pop ? "featured" : ""}`}>
                    <div className="plan-card-head">
                      <h3>{plan.title}</h3>
                      {plan.badge && <span className={`plan-badge ${pop ? "hot" : ""}`}>{plan.badge}</span>}
                    </div>
                    <div className="plan-price">
                      <b>₹{plan.priceInr}</b>
                      <span>/ {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"}</span>
                    </div>
                    <div className="plan-unit">Only ₹{per} per mock test</div>
                    <ul className="plan-perks">
                      <li><Icon.Check /> {plan.papersCount} Mock Test {plan.papersCount === 1 ? "Credit" : "Credits"}</li>
                      <li><Icon.Check /> 25 fresh non-repeating questions</li>
                      <li><Icon.Check /> Unlocks Saved Questions bank</li>
                      <li><Icon.Check /> Credits never expire</li>
                    </ul>
                    <button
                      className={`btn ${pop ? "btn-primary" : "btn-outline"} full`}
                      onClick={() => user ? setShowPlans(true) : setAuthModal({ mode: "login", after: () => setShowPlans(true) })}
                    >
                      Get {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"} →
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : tab === "leaderboard" ? (
          <section className="fade-in">
            <div className="section-head">
              <div>
                <span className="eyebrow">RANKINGS</span>
                <h1>Top Performers</h1>
                <p className="muted-sm">Ranked by highest score, accuracy, and fastest completion time.</p>
              </div>
              <select className="ctrl" style={{ maxWidth: 280 }} value={lbPaperId} onChange={e => setLbPaperId(e.target.value)}>
                {papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>

            {leaderboard.length > 0 && (
              <div className="podium-grid">
                {leaderboard.slice(0, 3).map((r, i) => (
                  <article key={i} className={`podium-card rank-${i + 1}`}>
                    <div className="podium-rank">#{i + 1}</div>
                    <div className="avatar-md">{getInitials(r.user_name)}</div>
                    <h3>{r.user_name}</h3>
                    <small>{r.user_city || "India"}</small>
                    <div className="podium-metrics">
                      <div><span>SCORE</span><b>{r.score}/{r.total_questions}</b></div>
                      <div><span>ACCURACY</span><b>{r.accuracy_percent}%</b></div>
                      <div><span>TIME</span><b>{Math.floor((r.time_taken_sec || 0) / 60)}m {(r.time_taken_sec || 0) % 60}s</b></div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Rank</th><th>Student</th><th>City</th><th>Score</th><th>Accuracy</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {leaderboard.map((r, i) => (
                    <tr key={i}>
                      <td><span className={`rank-pill rank-${i < 3 ? i + 1 : "n"}`}>#{i + 1}</span></td>
                      <td><b>{r.user_name}</b></td>
                      <td>{r.user_city || "—"}</td>
                      <td><b>{r.score}/{r.total_questions}</b></td>
                      <td><span className="pill good">{r.accuracy_percent}%</span></td>
                      <td>{Math.floor((r.time_taken_sec || 0) / 60)}m {(r.time_taken_sec || 0) % 60}s</td>
                    </tr>
                  ))}
                  {!leaderboard.length && (
                    <tr><td colSpan={6} className="empty-cell">No completed attempts for this paper yet. Be the first!</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : tab === "saved" ? (
          <section className="fade-in">
            {!user ? (
              <div className="empty-panel">
                <div className="empty-icon"><Icon.Bookmark /></div>
                <h2>Sign in to view Saved Questions</h2>
                <p className="muted-sm">Bookmark tricky questions during tests for quick revision before exams.</p>
                <button className="btn btn-primary" onClick={() => setAuthModal({ mode: "login" })}>Sign In →</button>
              </div>
            ) : !isPaidUser ? (
              <div className="empty-panel">
                <div className="empty-icon lock"><Icon.Lock /></div>
                <span className="eyebrow">PRO FEATURE</span>
                <h2>Saved Questions is for Paid Users</h2>
                <p className="muted-sm">Buy any Paper Pack (starting at ₹{minPlanPrice}) to unlock unlimited question bookmarking and your personal revision bank.</p>
                <button className="btn btn-primary" onClick={() => setShowPlans(true)}>Unlock with Paper Plan →</button>
              </div>
            ) : (
              <>
                <div className="section-head">
                  <div>
                    <span className="eyebrow">REVISION BANK</span>
                    <h1>Saved Questions ({bookmarks.length})</h1>
                  </div>
                </div>
                <div className="stack">
                  {bookmarks.map((qItem, i) => (
                    <article key={qItem.id} className="review-card ok">
                      <div className="review-head">
                        <span className="q-idx">Q{i + 1}</span>
                        <div className="review-q">{qItem.question_text}</div>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={async () => {
                            await api(`/api/bookmarks/${encodeURIComponent(qItem.id)}`, { method: "DELETE" });
                            setBookmarks(b => b.filter(x => x.id !== qItem.id));
                            toast("Removed from saved.");
                          }}
                        >Remove</button>
                      </div>
                      <div className="review-ans">
                        Correct Answer: <b className="text-green">{qItem.correct_option} — {qItem[`option_${String(qItem.correct_option || "a").toLowerCase()}`]}</b>
                      </div>
                      {qItem.explanation && <div className="explain"><b>Explanation:</b> {qItem.explanation}</div>}
                    </article>
                  ))}
                  {!bookmarks.length && (
                    <div className="empty-panel">
                      <div className="empty-icon"><Icon.Bookmark /></div>
                      <h3>No saved questions yet</h3>
                      <p className="muted-sm">Tap <b>☆ Save</b> during any test or result review to build your revision bank.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        ) : tab === "profile" ? (
          <section className="fade-in">
            {!user ? (
              <div className="empty-panel">
                <div className="empty-icon"><Icon.User /></div>
                <h2>Sign in to manage your Profile</h2>
                <p className="muted-sm">Set your State &amp; District, check Paper Credits, and manage your account.</p>
                <button className="btn btn-primary" onClick={() => setAuthModal({ mode: "login" })}>Sign In / Create Account →</button>
              </div>
            ) : (
              <div className="stack">
                <div className="profile-banner">
                  <div className="profile-identity">
                    <div className="avatar-lg">{getInitials(user.name)}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h2>{user.name}</h2>
                        <span className={`pill ${isPaidUser ? "good" : ""}`}>{isPaidUser ? "PRO MEMBER" : "FREE ACCOUNT"}</span>
                      </div>
                      <p className="muted-sm">{user.email}{(user.city || user.state) ? ` · ${[user.city, user.state].filter(Boolean).join(", ")}` : ""}</p>
                    </div>
                  </div>
                  <div className="profile-quick-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => setTab("attempts")}>My Scores ({attempts.length})</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowPlans(true)}>Buy Credits</button>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="panel">
                    <span className="eyebrow">PERSONAL DETAILS</span>
                    <h3 style={{ marginBottom: 14, fontSize: 18 }}>Profile &amp; Location</h3>
                    <form className="stack" onSubmit={saveProfile}>
                      <label className="field"><span>Full Name</span><input className="ctrl" name="name" defaultValue={user.name} required /></label>
                      <label className="field"><span>Email Address</span><input className="ctrl" value={user.email} disabled /></label>
                      <div className="grid-2">
                        <label className="field"><span>State</span>
                          <select className="ctrl" name="state" defaultValue={user.state || ""}>
                            <option value="">Select State</option>
                            {STATES_IN.map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </label>
                        <label className="field"><span>District / City</span><input className="ctrl" name="city" defaultValue={user.city || ""} placeholder="e.g. Bhiwani, Hisar" /></label>
                      </div>
                      <button className="btn btn-primary" type="submit" disabled={savingProfile}>
                        {savingProfile ? "Saving…" : "Save Changes"}
                      </button>
                    </form>
                  </div>

                  <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16 }}>
                    <div>
                      <span className="eyebrow">ACCOUNT OVERVIEW</span>
                      <h3 style={{ marginBottom: 14, fontSize: 18 }}>Credits &amp; Performance</h3>
                      <div className="kpi-grid">
                        <div className="kpi"><span>Paper Credits</span><b>{credits}</b><small>Available tests</small></div>
                        <div className="kpi"><span>Tests Taken</span><b>{attempts.length}</b><small>Avg {avgAccuracy}% accuracy</small></div>
                      </div>
                    </div>
                    <div className="stack">
                      <button className="btn btn-primary full" onClick={() => setShowPlans(true)}>Buy More Paper Credits →</button>
                      <button
                        className="btn btn-outline full"
                        style={{ color: "var(--red)" }}
                        onClick={async () => {
                          await api("/api/auth/logout", { method: "POST", body: "{}" });
                          setUser(null); setAttempts([]); setBookmarks([]); setTab("tests");
                          toast("Logged out.");
                        }}
                      >Sign Out</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : tab === "attempts" ? (
          <section className="fade-in">
            {!user ? (
              <div className="empty-panel">
                <div className="empty-icon"><Icon.Scores /></div>
                <h2>Sign in to view your scores</h2>
                <p className="muted-sm">Track all your mock test attempts, accuracy, and progress over time.</p>
                <button className="btn btn-primary" onClick={() => setAuthModal({ mode: "login" })}>Sign In / Create Account →</button>
              </div>
            ) : (
              <div className="stack">
                <div className="section-head" style={{ marginBottom: 4 }}>
                  <div>
                    <span className="eyebrow">PERFORMANCE</span>
                    <h1>My Mock Test Scores</h1>
                  </div>
                </div>
                <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                  <div className="kpi"><span>Tests Completed</span><b>{attempts.length}</b><small>Submitted attempts</small></div>
                  <div className="kpi"><span>Best Accuracy</span><b>{bestAccuracy}%</b><small>Personal record</small></div>
                  <div className="kpi"><span>Average Accuracy</span><b>{avgAccuracy}%</b><small>Across all papers</small></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Exam Paper</th><th>Score</th><th>Accuracy</th><th>Mode</th><th>Date</th></tr></thead>
                    <tbody>
                      {attempts.map(a => (
                        <tr key={a.id}>
                          <td><b>{paperTitleMap[a.paper_id] || a.paper_id}</b></td>
                          <td><b>{a.score}/{a.total_questions}</b></td>
                          <td><span className={`pill ${Number(a.accuracy_percent) >= 60 ? "good" : ""}`}>{a.accuracy_percent}%</span></td>
                          <td><span className="pill">{a.is_free ? "Free" : "Credit"}</span></td>
                          <td className="muted-sm">{new Date(a.submitted_at || a.started_at).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                      {!attempts.length && (
                        <tr><td colSpan={5} className="empty-cell">You haven't completed any mock test yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : (
          <div className="fade-in stack" style={{ gap: 20 }}>
            <section className="hero-surface compact-hero">
              <div className="hero-main">
                <span className="hero-badge">
                  {freeOk ? "1ST MOCK TEST FREE" : credits > 0 ? `${credits} CREDITS AVAILABLE` : "SMART EXAM PREP"}
                </span>
                <h1>Practice smarter for Govt &amp; Board Exams</h1>
                <p>
                  Every test draws 25 non-repeating questions from our curated bank with a 15-minute live timer,
                  instant rank, and step-by-step solutions.
                </p>
                <div className="hero-cta">
                  <button className="btn btn-primary" onClick={() => papers[0] && startPaper(papers[0].id)}>
                    {freeOk ? "Start Free Mock Test →" : "Start Mock Test →"}
                  </button>
                  <button className="btn btn-outline" onClick={() => setTab("plans")}>
                    View Plans (From ₹{minPlanPrice})
                  </button>
                </div>
              </div>
              <div className="hero-highlights">
                <div className="hl-item">
                  <b>1st Test Free</b>
                  <span>Try any exam paper with zero payment</span>
                </div>
                <div className="hl-item">
                  <b>25 Fresh Qs</b>
                  <span>Non-repeating questions per attempt</span>
                </div>
                <div className="hl-item">
                  <b>Live Leaderboard</b>
                  <span>Compare score &amp; speed across India</span>
                </div>
                <div className="hl-item">
                  <b>Revision Bank</b>
                  <span>Save tricky questions for last-day prep</span>
                </div>
              </div>
            </section>

            {user && (
              <section className="dash-strip">
                <div className="dash-tile" onClick={() => setShowPlans(true)} style={{ cursor: "pointer" }}>
                  <span>PAPER CREDITS</span>
                  <b>{credits}</b>
                  <small>Tap to add more →</small>
                </div>
                <div className="dash-tile" onClick={() => setTab("attempts")} style={{ cursor: "pointer" }}>
                  <span>TESTS TAKEN</span>
                  <b>{attempts.length}</b>
                  <small>View score history →</small>
                </div>
                <div className="dash-tile">
                  <span>BEST ACCURACY</span>
                  <b>{bestAccuracy}%</b>
                  <small>Personal best</small>
                </div>
                <div className="dash-tile" onClick={() => setTab("profile")} style={{ cursor: "pointer" }}>
                  <span>ACCOUNT TIER</span>
                  <b>{isPaidUser ? "PRO" : "FREE"}</b>
                  <small>{isPaidUser ? "Bookmarks unlocked" : "Upgrade with any pack"}</small>
                </div>
              </section>
            )}

            <section>
              <div className="section-head" style={{ marginBottom: 10 }}>
                <div>
                  <span className="eyebrow">EXAM CATALOG</span>
                  <h2 style={{ fontSize: 22 }}>Available Mock Tests ({visiblePapers.length})</h2>
                </div>
                <div className="search-wrap">
                  <Icon.Search />
                  <input
                    className="search-input"
                    type="search"
                    placeholder="Search exam, subject, or category…"
                    value={paperSearch}
                    onChange={e => setPaperSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="cat-bar">
                {cats.map(c => (
                  <button key={c} className={`cat-chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>
                    {c === "all" ? "All Exams" : c}
                  </button>
                ))}
              </div>

              <div className="papers-grid compact-grid">
                {visiblePapers.map(p => {
                  const canStartFree = freeOk;
                  const hasCreds = credits > 0;
                  const statusBadge = canStartFree ? "1st Free" : hasCreds ? "1 Credit" : `From ₹${minPlanPrice}`;
                  return (
                    <article key={p.id} className="paper-card compact-card">
                      <div className="card-top">
                        <div className="paper-title-group">
                          <span className="paper-monogram">{(p.category || p.title || "Y").slice(0, 2).toUpperCase()}</span>
                          <span className="pill">{p.category}</span>
                        </div>
                        <span className={`pill ${canStartFree || hasCreds ? "good" : ""}`}>{statusBadge}</span>
                      </div>

                      <h3>{p.title}</h3>
                      {p.description && <p className="paper-desc">{p.description}</p>}

                      <div className="meta-row">
                        <span><Icon.Clock /> {p.durationMinutes}m</span>
                        <span><Icon.Help /> {p.questionsPerAttempt} Qs</span>
                        <span><Icon.Layers /> {p.totalBankQuestions} Bank</span>
                      </div>

                      {p.sponsorName && (
                        <div className="sponsor-box">
                          <span>Sponsored by <b>{p.sponsorName}</b></span>
                          {p.sponsorLink && <a href={p.sponsorLink} target="_blank" rel="noopener noreferrer">Visit →</a>}
                        </div>
                      )}

                      <button
                        className={`btn ${canStartFree || hasCreds ? "btn-primary" : "btn-outline"} btn-sm full`}
                        style={{ marginTop: "auto" }}
                        disabled={p.totalBankQuestions === 0 || startingPaperId === p.id}
                        onClick={() => startPaper(p.id)}
                      >
                        {startingPaperId === p.id ? (
                          <><span className="spinner" /> Starting…</>
                        ) : p.totalBankQuestions === 0 ? (
                          "Coming Soon"
                        ) : canStartFree ? (
                          "Start Free Test →"
                        ) : hasCreds ? (
                          "Start Test (1 Credit) →"
                        ) : (
                          "Unlock Plan →"
                        )}
                      </button>
                    </article>
                  );
                })}
                {!visiblePapers.length && (
                  <div className="empty-panel" style={{ gridColumn: "1 / -1" }}>
                    <div className="empty-icon"><Icon.Search /></div>
                    <h3>No matching exam papers</h3>
                    <p className="muted-sm">Try clearing your search filter or switching to All Exams.</p>
                    <button className="btn btn-outline btn-sm" onClick={() => { setCat("all"); setPaperSearch(""); }}>Reset Filters</button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {!activeQuiz && (
        <nav className="mobile-dock" aria-label="Mobile Navigation">
          <button className={tab === "tests" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("tests"); }}>
            <Icon.Tests /><span>Tests</span>
          </button>
          <button className={tab === "plans" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("plans"); }}>
            <Icon.Plans /><span>Plans</span>
          </button>
          <button className={tab === "leaderboard" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("leaderboard"); }}>
            <Icon.Trophy /><span>Ranks</span>
          </button>
          <button className={tab === "saved" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("saved"); }}>
            <Icon.Bookmark /><span>Saved</span>
          </button>
          <button className={tab === "profile" && !result ? "active" : ""} onClick={() => { setResult(null); setTab("profile"); }}>
            <Icon.User /><span>Profile</span>
          </button>
        </nav>
      )}

      {authModal && (
        <AuthModal
          config={config}
          initialMode={authModal.mode}
          toast={toast}
          onClose={() => setAuthModal(null)}
          onSuccess={async () => {
            const fn = authModal.after;
            setAuthModal(null);
            await refreshData();
            if (fn) fn();
          }}
        />
      )}
      {showPlans && (
        <PlansModal
          plans={plans}
          config={config}
          user={user}
          toast={toast}
          onClose={() => setShowPlans(false)}
          onPurchased={async () => { setShowPlans(false); await refreshData(); }}
        />
      )}
      <div className={`toast ${toastState.show ? "show" : ""} ${toastState.kind}`}>{toastState.msg}</div>
    </div>
  );
}
