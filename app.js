(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const S = {
    config: null, user: null, papers: [], attempts: [], leaderboard: [],
    tab: "tests", cat: "all", lbPaperId: "",
    activeQuiz: null, qIndex: 0, answers: {}, timerId: null, secondsLeft: 0,
    result: null, theme: document.documentElement.getAttribute("data-theme") || "light"
  };

  let toastTimer;
  function toast(msg, kind = "") {
    const el = $("#toast");
    el.textContent = msg;
    el.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast"; }, 3400);
  }

  async function api(url, opts = {}) {
    const r = await fetch(url, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || `Request failed (${r.status})`);
      err.data = data; err.status = r.status;
      throw err;
    }
    return data;
  }

  async function withBusy(btn, label, fn) {
    if (!btn || btn.disabled) return;
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span><span>${esc(label)}</span>`;
    try { return await fn(); }
    finally { btn.disabled = false; if (btn.isConnected) btn.innerHTML = old; }
  }

  function getDeviceMeta() {
    let deviceId = "";
    let deviceFreeUsed = false;
    try {
      deviceId = localStorage.getItem("quiz_device_id") || "";
      if (!deviceId) {
        deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem("quiz_device_id", deviceId);
      }
      deviceFreeUsed = localStorage.getItem("quiz_free_used") === "1";
    } catch {}
    const raw = [navigator.platform, navigator.language, `${screen.width}x${screen.height}`, Intl.DateTimeFormat().resolvedOptions().timeZone].join("|");
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
    return { deviceId, deviceFp: `qfp_${(h >>> 0).toString(16)}`, deviceFreeUsed };
  }
  function markFreeUsed() { try { localStorage.setItem("quiz_free_used", "1"); } catch {} }

  function toggleTheme() {
    S.theme = S.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", S.theme);
    try { localStorage.setItem("quiz_theme", S.theme); } catch {}
    $("#themeColorMeta")?.setAttribute("content", S.theme === "dark" ? "#080c14" : "#f4f6fb");
    render();
  }

  async function loadAll() {
    const dm = getDeviceMeta();
    const [cfg, papersRes, meRes] = await Promise.all([
      api(`/api/public/config?deviceId=${encodeURIComponent(dm.deviceId)}&deviceFp=${encodeURIComponent(dm.deviceFp)}`),
      api("/api/papers"),
      api("/api/auth/me")
    ]);
    S.config = cfg;
    S.papers = papersRes.papers || [];
    S.user = meRes.authenticated ? meRes.user : null;
    if (!S.lbPaperId && S.papers.length) S.lbPaperId = S.papers[0].id;
    document.title = `${cfg.siteName || "Mintu Exam Hub"} — Mock Tests`;
    if (S.user) {
      const att = await api("/api/attempts").catch(() => ({ attempts: [] }));
      S.attempts = att.attempts || [];
    } else {
      S.attempts = [];
    }
  }

  function render() {
    const root = $("#appRoot");
    const siteName = S.config?.siteName || "Mintu Exam Hub";
    const ann = S.config?.announcement;

    root.innerHTML = `
      <header class="topbar">
        <a class="brand" href="#" id="goHome"><span class="logo-mark">Q</span><div><b>${esc(siteName)}</b><small>15-MIN MOCK TESTS</small></div></a>
        <nav class="top-nav">
          <button data-tab="tests" class="${S.tab === "tests" ? "active" : ""}">Mock Tests</button>
          <button data-tab="leaderboard" class="${S.tab === "leaderboard" ? "active" : ""}">Leaderboard</button>
          <button data-tab="attempts" class="${S.tab === "attempts" ? "active" : ""}">My Scores</button>
        </nav>
        <div class="top-actions">
          <button class="btn btn-outline btn-sm" id="themeBtn" title="Switch Light/Dark">${S.theme === "dark" ? "☀️" : "🌙"}</button>
          ${S.user ? `<button class="btn btn-outline btn-sm" id="logoutBtn">${esc(S.user.name.split(" ")[0])} · Logout</button>` : `<button class="btn btn-primary btn-sm" id="loginBtn">Login / Sign up</button>`}
        </div>
      </header>
      <main class="wrap">
        ${ann?.enabled && ann?.text ? `<div class="notice-banner">📢 ${esc(ann.text)}</div>` : ""}
        ${S.activeQuiz ? quizRunnerHtml() : S.result ? resultHtml() : S.tab === "leaderboard" ? leaderboardHtml() : S.tab === "attempts" ? attemptsHtml() : testsHtml()}
      </main>
      ${!S.activeQuiz ? `<nav class="mobile-bar">
        <button data-tab="tests" class="${S.tab === "tests" ? "active" : ""}">Tests</button>
        <button data-tab="leaderboard" class="${S.tab === "leaderboard" ? "active" : ""}">Rankings</button>
        <button data-tab="attempts" class="${S.tab === "attempts" ? "active" : ""}">My Scores</button>
      </nav>` : ""}
    `;
    bindEvents();
  }

  function testsHtml() {
    const cats = ["all", ...new Set(S.papers.map(p => p.category || "Other"))];
    const list = S.cat === "all" ? S.papers : S.papers.filter(p => (p.category || "Other") === S.cat);
    const freeOk = S.config?.freeEligible;

    return `
      <section class="hero">
        <div>
          <span class="hero-pill">${freeOk ? "🎁 1ST MOCK PAPER FREE" : "⚡ INSTANT MOCK TESTS"}</span>
          <h1>Crack Your Exam with 15-Min Smart Tests</h1>
          <p>Every attempt picks 25 fresh random questions from our server bank with instant rank, accuracy & detailed explanations.</p>
        </div>
        <div class="hero-badge">
          <b>${freeOk ? "FREE" : `₹${Number(S.config?.defaultPaperPrice || 25)}`}</b>
          <small>${freeOk ? "Your 1st paper is free!" : "Per unlocked paper"}</small>
        </div>
      </section>
      <div class="cat-bar">${cats.map(c => `<button class="cat-chip ${S.cat === c ? "active" : ""}" data-cat="${esc(c)}">${c === "all" ? "All Exams" : esc(c)}</button>`).join("")}</div>
      <div class="grid">
        ${list.map(p => {
          const isFreeOrUnlocked = freeOk || p.hasPaidPass || Number(p.priceInr) <= 0;
          const badgeText = p.hasPaidPass ? "Unlocked Pass" : freeOk ? "1st Paper Free" : `₹${Number(p.priceInr)} / Paper`;
          return `<article class="card">
            <div class="card-top"><span class="tag">${esc(p.category)}</span><span class="price-tag ${isFreeOrUnlocked ? "" : "paid"}">${badgeText}</span></div>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.description || "Timed objective mock test with live leaderboard.")}</p>
            <div class="meta-row"><span>⏱ ${p.durationMinutes} Mins</span><span>❓ ${p.questionsPerAttempt} Random Qs</span><span>📚 ${p.totalBankQuestions} in Bank</span></div>
            ${p.sponsorName ? `<div class="sponsor-box"><span>Sponsored by <b>${esc(p.sponsorName)}</b>${p.sponsorTagline ? ` — ${esc(p.sponsorTagline)}` : ""}</span>${p.sponsorLink ? `<a href="${esc(p.sponsorLink)}" target="_blank" rel="noopener">Visit →</a>` : ""}</div>` : ""}
            <div class="card-actions">
              <button class="btn btn-primary full" data-start-paper="${esc(p.id)}">${p.totalBankQuestions > 0 ? (isFreeOrUnlocked ? "Start Mock Test →" : `Unlock for ₹${Number(p.priceInr)} →`) : "Questions Coming Soon"}</button>
            </div>
          </article>`;
        }).join("") || `<div class="card"><b>No exam papers active yet.</b><p>Admin can add papers and generate questions in seconds.</p></div>`}
      </div>
    `;
  }

  function quizRunnerHtml() {
    const q = S.activeQuiz.questions[S.qIndex];
    const chosen = S.answers[q.id] || "";
    const mins = String(Math.floor(S.secondsLeft / 60)).padStart(2, "0");
    const secs = String(S.secondsLeft % 60).padStart(2, "0");
    const answeredCount = Object.keys(S.answers).length;
    return `
      <div class="quiz-head">
        <div><b>${esc(S.activeQuiz.paper.title)}</b><div style="font-size:12px;color:var(--muted)">Question ${S.qIndex + 1} of ${S.activeQuiz.questions.length} · ${answeredCount} answered</div></div>
        <div class="timer ${S.secondsLeft <= 60 ? "warn" : ""}" id="quizTimer">⏱ ${mins}:${secs}</div>
      </div>
      <div class="quiz-layout">
        <section class="q-box">
          <div class="q-meta"><span>Topic: <b>${esc(q.topic || "General")}</b></span><button class="btn btn-outline btn-sm" id="reportQ" data-qid="${esc(q.id)}">🚩 Report typo</button></div>
          <div class="q-text">${esc(q.question_text)}</div>
          <div class="options">
            ${["A", "B", "C", "D"].map(k => `<button type="button" class="opt-btn ${chosen === k ? "selected" : ""}" data-opt="${k}"><span class="opt-key">${k}</span><span>${esc(q[`option_${k.toLowerCase()}`])}</span></button>`).join("")}
          </div>
          <div class="q-nav">
            <button class="btn btn-outline" id="prevQ" ${S.qIndex === 0 ? "disabled" : ""}>← Previous</button>
            ${S.qIndex < S.activeQuiz.questions.length - 1 ? `<button class="btn btn-primary" id="nextQ">Next →</button>` : `<button class="btn btn-primary" id="submitQuizBtn">Submit Test ✓</button>`}
          </div>
        </section>
        <aside class="palette">
          <b>Question Palette</b>
          <div class="palette-grid">
            ${S.activeQuiz.questions.map((item, idx) => `<button type="button" class="p-dot ${S.answers[item.id] ? "answered" : ""} ${idx === S.qIndex ? "current" : ""}" data-jump="${idx}">${idx + 1}</button>`).join("")}
          </div>
          <button class="btn btn-primary full" id="submitQuizSide">Finish &amp; Submit (${answeredCount}/${S.activeQuiz.questions.length})</button>
        </aside>
      </div>
    `;
  }

  function resultHtml() {
    const r = S.result;
    const shareText = `I scored ${r.score}/${r.total} (${r.accuracy}%) and got Rank #${r.rank} on ${S.config?.siteName || "Mintu Exam Hub"}! Try your 1st free mock test: ${location.origin}`;
    return `
      <section class="result-card">
        <span class="hero-pill">TEST COMPLETED</span>
        <h1>Your Score Card 🏆</h1>
        <div class="result-stats">
          <div><small>SCORE</small><b>${r.score} / ${r.total}</b></div>
          <div><small>ACCURACY</small><b>${r.accuracy}%</b></div>
          <div><small>LIVE RANK</small><b>#${r.rank}</b></div>
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <a class="btn btn-outline" style="background:#fff;color:#0f172a" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText)}">Share Rank on WhatsApp</a>
          <button class="btn btn-outline" style="background:rgba(255,255,255,0.2);color:#fff;border-color:rgba(255,255,255,0.4)" id="backToTests">Back to All Tests</button>
        </div>
      </section>
      <h2 style="margin-bottom:12px">Answer Key &amp; Explanations</h2>
      ${r.review.map((item, i) => `
        <article class="review-item ${item.isCorrect ? "ok" : "bad"}">
          <div style="font-weight:700;margin-bottom:6px">Q${i + 1}. ${esc(item.question_text)}</div>
          <div style="font-size:13px">Your answer: <b>${item.chosen || "Skipped"}</b> · Correct: <b style="color:var(--green)">${item.correct_option} (${esc(item[`option_${item.correct_option.toLowerCase()}`])})</b></div>
          ${item.explanation ? `<div class="explain">💡 ${esc(item.explanation)}</div>` : ""}
        </article>
      `).join("")}
    `;
  }

  function leaderboardHtml() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <h2>Top Rankers 🏆</h2>
        <select class="form-control" id="lbPaperSelect" style="max-width:280px">${S.papers.map(p => `<option value="${esc(p.id)}" ${p.id === S.lbPaperId ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Student</th><th>City</th><th>Score</th><th>Accuracy</th><th>Time</th></tr></thead><tbody>
        ${S.leaderboard.map((row, idx) => `<tr><td><b>#${idx + 1}</b></td><td><b>${esc(row.user_name || "Student")}</b></td><td>${esc(row.user_city || "—")}</td><td><b>${row.score}/${row.total_questions}</b></td><td>${row.accuracy_percent}%</td><td>${Math.floor((row.time_taken_sec || 0) / 60)}m ${(row.time_taken_sec || 0) % 60}s</td></tr>`).join("") || `<tr><td colspan="6">No completed attempts yet for this paper.</td></tr>`}
      </tbody></table></div>
    `;
  }

  function attemptsHtml() {
    if (!S.user) return `<div class="card"><h3>Login to view your test history</h3><p>Sign in with Email or Google to track your scores and ranks.</p><button class="btn btn-primary" id="loginPromptBtn">Login / Sign up</button></div>`;
    return `
      <h2 style="margin-bottom:14px">My Past Mock Tests</h2>
      <div class="table-wrap"><table><thead><tr><th>Paper</th><th>Score</th><th>Accuracy</th><th>Type</th><th>Date</th></tr></thead><tbody>
        ${S.attempts.map(a => `<tr><td><b>${esc(a.paper_id)}</b></td><td><b>${a.score}/${a.total_questions}</b></td><td>${a.accuracy_percent}%</td><td>${a.is_free ? "Free" : "Paid"}</td><td>${new Date(a.submitted_at || a.started_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td></tr>`).join("") || `<tr><td colspan="5">You haven't completed any mock test yet.</td></tr>`}
      </tbody></table></div>
    `;
  }

  function openAuthModal(mode = "login", onDone = null) {
    const mRoot = $("#modalRoot");
    mRoot.innerHTML = `<div class="modal-backdrop" data-close-bg>
      <section class="modal">
        <button class="modal-x" data-close>×</button>
        <h2>${mode === "signup" ? "Create Student Account" : "Student Login"}</h2>
        <div id="gBtnWrap"></div>
        <div class="err" id="gErr"></div>
        <form id="authForm" style="display:grid;gap:10px">
          ${mode === "signup" ? `<input class="form-control" name="name" required placeholder="Full Name"><input class="form-control" name="city" placeholder="City / District (e.g. Bhiwani)">` : ""}
          <input class="form-control" name="email" type="email" required placeholder="Email Address">
          <input class="form-control" name="password" type="password" minlength="6" required placeholder="Password (6+ chars)">
          <div class="err" id="aErr"></div>
          <button class="btn btn-primary full" type="submit">${mode === "signup" ? "Create Account" : "Login"}</button>
        </form>
        <button class="btn btn-outline btn-sm" id="switchAuth">${mode === "signup" ? "Already have an account? Login" : "New here? Create free account"}</button>
      </section>
    </div>`;
    mRoot.querySelector("[data-close-bg]").addEventListener("click", e => { if (e.target === e.currentTarget) mRoot.innerHTML = ""; });
    mRoot.querySelector("[data-close]").addEventListener("click", () => { mRoot.innerHTML = ""; });
    $("#switchAuth").addEventListener("click", () => openAuthModal(mode === "signup" ? "login" : "signup", onDone));

    if (S.config?.googleClientId) {
      const mountG = (tries = 0) => {
        const host = $("#gBtnWrap");
        if (!host) return;
        if (!window.google?.accounts?.id) {
          if (tries < 20) return setTimeout(() => mountG(tries + 1), 200);
          return;
        }
        window.google.accounts.id.initialize({
          client_id: S.config.googleClientId,
          callback: async resp => {
            try {
              await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: resp.credential }) });
              mRoot.innerHTML = "";
              await loadAll(); render();
              toast("Signed in with Google!", "success");
              if (onDone) onDone();
            } catch (e) { $("#gErr").textContent = e.message; }
          }
        });
        window.google.accounts.id.renderButton(host, { theme: "outline", size: "large", width: 320 });
      };
      mountG(0);
    }

    $("#authForm").addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      withBusy(e.currentTarget.querySelector("button[type=submit]"), "Please wait…", async () => {
        $("#aErr").textContent = "";
        try {
          await api(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(fd.entries())) });
          mRoot.innerHTML = "";
          await loadAll(); render();
          toast("Welcome!", "success");
          if (onDone) onDone();
        } catch (err) { $("#aErr").textContent = err.message; }
      });
    });
  }

  async function startPaperFlow(paperId, btn) {
    if (!S.user) return openAuthModal("login", () => startPaperFlow(paperId));
    await withBusy(btn, "Starting…", async () => {
      try {
        const dm = getDeviceMeta();
        const res = await api("/api/attempts/start", { method: "POST", body: JSON.stringify({ paperId, ...dm }) });
        if (res.isFree) markFreeUsed();
        S.activeQuiz = res;
        S.qIndex = 0;
        S.answers = {};
        S.result = null;
        S.secondsLeft = Number(res.paper.durationMinutes || 15) * 60;
        startTimer();
        render();
      } catch (err) {
        if (err.status === 402 && err.data?.requiresPayment) {
          openRazorpayUnlock(paperId, err.data.priceInr);
        } else {
          toast(err.message, "error");
        }
      }
    });
  }

  async function openRazorpayUnlock(paperId, priceInr) {
    if (!S.config?.razorpayReady || !window.Razorpay) {
      toast(`Payment required (₹${priceInr}). Razorpay keys are being configured by admin.`, "error");
      return;
    }
    try {
      const ord = await api("/api/payments/create-order", { method: "POST", body: JSON.stringify({ paperId }) });
      const rzp = new window.Razorpay({
        key: ord.keyId, amount: ord.amount, currency: ord.currency,
        name: S.config?.siteName || "Mintu Exam Hub", description: `Unlock ${ord.paperTitle}`,
        order_id: ord.orderId,
        prefill: { name: S.user?.name || "", email: S.user?.email || "" },
        handler: async resp => {
          try {
            await api("/api/payments/verify", { method: "POST", body: JSON.stringify(resp) });
            toast("Paper unlocked! Starting test…", "success");
            await loadAll();
            startPaperFlow(paperId);
          } catch (e) { toast(e.message, "error"); }
        }
      });
      rzp.open();
    } catch (e) { toast(e.message, "error"); }
  }

  function startTimer() {
    clearInterval(S.timerId);
    S.timerId = setInterval(() => {
      S.secondsLeft -= 1;
      const el = $("#quizTimer");
      if (el) {
        const m = String(Math.max(0, Math.floor(S.secondsLeft / 60))).padStart(2, "0");
        const s = String(Math.max(0, S.secondsLeft % 60)).padStart(2, "0");
        el.textContent = `⏱ ${m}:${s}`;
        if (S.secondsLeft <= 60) el.classList.add("warn");
      }
      if (S.secondsLeft <= 0) {
        clearInterval(S.timerId);
        submitQuiz(true);
      }
    }, 1000);
  }

  async function submitQuiz(auto = false) {
    if (!S.activeQuiz) return;
    if (!auto && !confirm(`Submit test now? (${Object.keys(S.answers).length}/${S.activeQuiz.questions.length} answered)`)) return;
    clearInterval(S.timerId);
    const id = S.activeQuiz.attemptId;
    try {
      const res = await api(`/api/attempts/${encodeURIComponent(id)}/submit`, { method: "POST", body: JSON.stringify({ answers: S.answers }) });
      S.activeQuiz = null;
      S.result = res;
      await loadAll();
      render();
      toast(`Scored ${res.score}/${res.total}!`, "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function loadLeaderboard() {
    if (!S.lbPaperId) return;
    const res = await api(`/api/papers/${encodeURIComponent(S.lbPaperId)}/leaderboard`).catch(() => ({ leaderboard: [] }));
    S.leaderboard = res.leaderboard || [];
  }

  function bindEvents() {
    $("#themeBtn")?.addEventListener("click", toggleTheme);
    $("#loginBtn")?.addEventListener("click", () => openAuthModal("login"));
    $("#loginPromptBtn")?.addEventListener("click", () => openAuthModal("login"));
    $("#logoutBtn")?.addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); S.user = null; S.attempts = []; render(); toast("Logged out."); });
    $("#goHome")?.addEventListener("click", e => { e.preventDefault(); S.result = null; S.tab = "tests"; render(); });
    $$("[data-tab]").forEach(b => b.addEventListener("click", async () => {
      S.result = null; S.tab = b.dataset.tab;
      if (S.tab === "leaderboard") await loadLeaderboard();
      render();
    }));
    $$("[data-cat]").forEach(b => b.addEventListener("click", () => { S.cat = b.dataset.cat; render(); }));
    $$("[data-start-paper]").forEach(b => b.addEventListener("click", () => startPaperFlow(b.dataset.startPaper, b)));
    $("#lbPaperSelect")?.addEventListener("change", async e => { S.lbPaperId = e.target.value; await loadLeaderboard(); render(); });
    $("#backToTests")?.addEventListener("click", () => { S.result = null; S.tab = "tests"; render(); });

    // Quiz runner controls
    $$("[data-opt]").forEach(b => b.addEventListener("click", () => {
      const q = S.activeQuiz.questions[S.qIndex];
      S.answers[q.id] = b.dataset.opt;
      render();
    }));
    $$("[data-jump]").forEach(b => b.addEventListener("click", () => { S.qIndex = Number(b.dataset.jump); render(); }));
    $("#prevQ")?.addEventListener("click", () => { if (S.qIndex > 0) { S.qIndex--; render(); } });
    $("#nextQ")?.addEventListener("click", () => { if (S.qIndex < S.activeQuiz.questions.length - 1) { S.qIndex++; render(); } });
    $("#submitQuizBtn")?.addEventListener("click", () => submitQuiz(false));
    $("#submitQuizSide")?.addEventListener("click", () => submitQuiz(false));
    $("#reportQ")?.addEventListener("click", e => {
      const qid = e.currentTarget.dataset.qid;
      withBusy(e.currentTarget, "Reporting…", async () => {
        await api(`/api/questions/${encodeURIComponent(qid)}/report`, { method: "POST", body: "{}" });
        toast("Question reported to admin. Thank you!", "success");
      });
    });
  }

  async function boot() {
    try {
      await loadAll();
      render();
      try {
        if (!sessionStorage.getItem("quiz_visited")) {
          sessionStorage.setItem("quiz_visited", "1");
          fetch("/api/public/visit", { method: "POST" }).catch(() => {});
        }
      } catch {}
    } catch (e) {
      $("#appRoot").innerHTML = `<div class="boot"><p>Could not load: ${esc(e.message)}</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    }
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  boot();
})();
