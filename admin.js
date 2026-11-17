(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const S = { tab: "overview", overview: null, papers: [], questions: [], users: [], attempts: [], qFilterPaper: "", aiRunning: false, aiStop: false, aiStatus: "" };
  let toastT;
  function toast(msg, kind = "") { const el = $("#adminToast"); el.textContent = msg; el.className = `toast show ${kind}`; clearTimeout(toastT); toastT = setTimeout(() => el.className = "toast", 3400); }
  async function api(url, opts = {}) {
    const r = await fetch(url, { credentials: "same-origin", ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
    return d;
  }

  function loginView() {
    $("#adminApp").innerHTML = `<div class="login-wrap"><form class="login-card" id="aLogin"><div style="display:flex;align-items:center;gap:10px"><span class="mark">Q</span><div><b>Exam Hub Admin</b><div style="font-size:11px;color:var(--muted)">CONTROL PANEL</div></div></div><h2>Admin Login</h2><input class="ctrl" type="password" name="password" required placeholder="Enter ADMIN_PASSWORD"><div class="err" id="lErr"></div><button class="btn btn-primary" type="submit">Open Admin →</button></form></div>`;
    $("#aLogin").addEventListener("submit", async e => {
      e.preventDefault();
      const b = $("button", e.currentTarget); b.disabled = true;
      try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) }); start(); }
      catch (err) { $("#lErr").textContent = err.message; b.disabled = false; }
    });
  }

  async function refresh() {
    const jobs = [api("/api/admin/overview"), api("/api/admin/papers")];
    if (S.tab === "questions") jobs.push(api(`/api/admin/questions${S.qFilterPaper ? `?paperId=${encodeURIComponent(S.qFilterPaper)}` : ""}`));
    if (S.tab === "users") jobs.push(api("/api/admin/users"));
    if (S.tab === "attempts") jobs.push(api("/api/admin/attempts"));
    const res = await Promise.all(jobs);
    S.overview = res[0]; S.papers = res[1].papers || [];
    if (S.tab === "questions") S.questions = res[2].questions || [];
    if (S.tab === "users") S.users = res[2].users || [];
    if (S.tab === "attempts") S.attempts = res[2].attempts || [];
  }

  function render() {
    const tabs = [
      ["overview", "Overview"],
      ["ai", "AI Question Generator"],
      ["papers", "Papers & Sponsors"],
      ["questions", "Question Bank"],
      ["attempts", "Attempts & Leads"],
      ["users", "Students"],
      ["settings", "Settings"]
    ];
    $("#adminApp").innerHTML = `<div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="mark">Q</span><div><b>Exam Hub</b><div style="font-size:10px;color:var(--muted)">ADMIN PANEL</div></div></div>
        ${tabs.map(([id, label]) => `<button class="nav-btn ${S.tab === id ? "active" : ""}" data-tab="${id}">${label}</button>`).join("")}
        <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--line);display:grid;gap:6px">
          <a class="nav-btn" href="/" target="_blank">↗ Open Student Site</a>
          <button class="nav-btn" id="aLogout" style="color:var(--red)">Logout</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar"><h1>${tabs.find(t => t[0] === S.tab)?.[1] || "Overview"}</h1><button class="btn btn-outline" id="aRefresh">↻ Refresh</button></div>
        <div id="tabBody">${tabHtml()}</div>
      </main>
    </div>`;
    bind();
  }

  function tabHtml() {
    if (S.tab === "overview") {
      const s = S.overview?.stats || {};
      return `<div class="metrics">
        <div class="metric"><span>Visitors</span><b>${Number(s.totalVisitors || 0)}</b><small>${Number(s.todayVisitors || 0)} today</small></div>
        <div class="metric"><span>Students</span><b>${Number(s.users || 0)}</b><small>Registered accounts</small></div>
        <div class="metric"><span>Question Bank</span><b>${Number(s.questions || 0)}</b><small>Across ${Number(s.papers || 0)} papers</small></div>
        <div class="metric"><span>Tests Completed</span><b>${Number(s.attempts || 0)}</b><small>Submitted mock tests</small></div>
        <div class="metric"><span>Revenue</span><b>₹${Number(s.revenue || 0).toFixed(2)}</b><small>Razorpay unlocks</small></div>
      </div>
      <div class="panel"><h3>Quick Start</h3><p style="font-size:13px;color:var(--muted)">1) Go to <b>AI Question Generator</b>, select a paper, choose your AI Agent (Gemini / OpenAI / Groq / OpenRouter), paste your API key, and load 1,000+ questions into Supabase.<br>2) Add local coaching center sponsors under <b>Papers & Sponsors</b>.</p></div>`;
    }
    if (S.tab === "ai") {
      return `<div class="panel"><h3>🤖 AI Question Bank Generator (Auto-Load into Supabase)</h3>
        <form id="aiGenForm" class="form">
          <div class="grid-2">
            <label>Select Exam Paper<select class="ctrl" name="paperId" required>${S.papers.map(p => `<option value="${esc(p.id)}">${esc(p.title)} (${p.questionCount} Qs)</option>`).join("")}</select></label>
            <label>Select AI Agent / Provider<select class="ctrl" name="provider" id="aiProvider"><option value="gemini">Google Gemini (gemini-2.5-flash)</option><option value="openai">OpenAI (gpt-4o-mini)</option><option value="groq">Groq (llama-3.3-70b-versatile)</option><option value="openrouter">OpenRouter (gemini-2.0-flash)</option></select></label>
          </div>
          <div class="grid-2">
            <label>AI Agent API Key<input class="ctrl" type="password" name="apiKey" required placeholder="Paste your Gemini / OpenAI / Groq / OpenRouter API key"></label>
            <label>Custom Model Name (optional)<input class="ctrl" name="model" placeholder="Leave blank for default fast model"></label>
          </div>
          <div class="grid-2">
            <label>Topic / Syllabus Focus<input class="ctrl" name="topic" value="Full Syllabus (GK, Maths, Reasoning, Hindi/English)" required></label>
            <label>Language<select class="ctrl" name="language"><option>Bilingual (English + Hindi)</option><option>Hindi</option><option>English</option></select></label>
          </div>
          <div class="grid-2">
            <label>Difficulty<select class="ctrl" name="difficulty"><option value="medium">Medium (Exam Level)</option><option value="easy">Easy</option><option value="hard">Hard</option></select></label>
            <label>Total Questions to Generate (Auto-Batched)<select class="ctrl" name="targetTotal"><option value="25">25 Questions (1 batch)</option><option value="50">50 Questions (2 batches)</option><option value="100" selected>100 Questions (4 batches)</option><option value="250">250 Questions (10 batches)</option><option value="500">500 Questions (20 batches)</option><option value="1000">1,000 Questions (40 batches)</option></select></label>
          </div>
          ${S.aiStatus ? `<div class="progress-box" id="aiProgress">${esc(S.aiStatus)}</div>` : ""}
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" type="submit" ${S.aiRunning ? "disabled" : ""}>${S.aiRunning ? "Generating…" : "Start AI Generation & Save to Supabase →"}</button>
            ${S.aiRunning ? `<button class="btn btn-danger" type="button" id="stopAiBtn">Stop</button>` : ""}
          </div>
        </form>
      </div>
      <div class="panel"><h3>📥 Bulk JSON Import (Manual Paste)</h3>
        <form id="bulkForm" class="form">
          <label>Select Paper<select class="ctrl" name="paperId" required>${S.papers.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("")}</select></label>
          <label>Paste JSON Array<textarea class="ctrl" name="json" placeholder='[{"question_text":"...","option_a":"...","option_b":"...","option_c":"...","option_d":"...","correct_option":"A","explanation":"..."}]' required></textarea></label>
          <button class="btn btn-outline" type="submit">Import JSON Questions</button>
        </form>
      </div>`;
    }
    if (S.tab === "papers") {
      return `<div class="panel"><h3>Create Exam Paper</h3>
        <form id="paperForm" class="form">
          <div class="grid-2"><label>Paper Title<input class="ctrl" name="title" required placeholder="e.g. HSSC Group D Mock"></label><label>Category<input class="ctrl" name="category" value="HSSC" required></label></div>
          <label>Description<input class="ctrl" name="description" placeholder="Short description for students"></label>
          <div class="grid-2"><label>Duration (mins)<input class="ctrl" type="number" name="durationMinutes" value="15" required></label><label>Questions per Attempt<input class="ctrl" type="number" name="questionsPerAttempt" value="25" required></label></div>
          <div class="grid-2"><label>Price after 1st Free (₹)<input class="ctrl" type="number" name="priceInr" value="25" step="0.01" required></label><label>Sponsor Name (optional)<input class="ctrl" name="sponsorName" placeholder="e.g. Lakshya Academy, Bhiwani"></label></div>
          <div class="grid-2"><label>Sponsor Offer / Tagline<input class="ctrl" name="sponsorTagline" placeholder="Free Demo Class + Scholarship"></label><label>Sponsor Link (WhatsApp / Site)<input class="ctrl" name="sponsorLink" placeholder="https://wa.me/91..."></label></div>
          <button class="btn btn-primary" type="submit">Create Paper ＋</button>
        </form>
      </div>
      <div class="panel"><h3>All Papers (${S.papers.length})</h3><div class="table-wrap"><table><thead><tr><th>Paper</th><th>Bank Qs</th><th>Price</th><th>Sponsor</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        ${S.papers.map(p => `<tr><td><b>${esc(p.title)}</b><br><small>${esc(p.category)} · ${p.duration_minutes}m / ${p.questions_per_attempt} Qs</small></td><td><b>${p.questionCount}</b></td><td>₹${Number(p.price_inr)}</td><td>${esc(p.sponsor_name || "—")}</td><td><span class="pill ${p.active ? "good" : "bad"}">${p.active ? "Active" : "Paused"}</span></td><td><button class="btn btn-outline" data-toggle-paper="${esc(p.id)}" data-active="${p.active ? "1" : "0"}">${p.active ? "Pause" : "Activate"}</button> <button class="btn btn-danger" data-del-paper="${esc(p.id)}">Delete</button></td></tr>`).join("")}
      </tbody></table></div></div>`;
    }
    if (S.tab === "questions") {
      return `<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><h3>Question Bank (Latest 200)</h3><select class="ctrl" id="qFilter" style="max-width:260px"><option value="">All Papers</option>${S.papers.map(p => `<option value="${esc(p.id)}" ${S.qFilterPaper === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></div>
        <div class="table-wrap"><table><thead><tr><th>Question</th><th>Paper</th><th>Ans</th><th>Reports</th><th>Action</th></tr></thead><tbody>
          ${S.questions.map(q => `<tr><td style="max-width:420px"><b>${esc(q.question_text)}</b><br><small>A: ${esc(q.option_a)} | B: ${esc(q.option_b)} | C: ${esc(q.option_c)} | D: ${esc(q.option_d)}</small></td><td>${esc(q.paper_id)}</td><td><span class="pill good">${esc(q.correct_option)}</span></td><td>${q.reported_count > 0 ? `<span class="pill bad">🚩 ${q.reported_count}</span>` : "0"}</td><td><button class="btn btn-danger" data-del-q="${esc(q.id)}">Delete</button></td></tr>`).join("") || `<tr><td colspan="5">No questions found.</td></tr>`}
        </tbody></table></div></div>`;
    }
    if (S.tab === "attempts") {
      return `<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Completed Attempts &amp; Sponsor Leads</h3><button class="btn btn-primary" id="exportLeads">⬇ Export Leads CSV</button></div>
        <div class="table-wrap"><table><thead><tr><th>Student</th><th>City</th><th>Paper</th><th>Score</th><th>Type</th><th>Date</th></tr></thead><tbody>
          ${S.attempts.map(a => `<tr><td><b>${esc(a.user_name)}</b><br><small>${esc(a.user_email)}</small></td><td>${esc(a.user_city || "—")}</td><td>${esc(a.paper_id)}</td><td><b>${a.score}/${a.total_questions}</b> (${a.accuracy_percent}%)</td><td>${a.is_free ? "Free" : "Paid"}</td><td>${new Date(a.submitted_at || a.started_at).toLocaleString("en-IN")}</td></tr>`).join("") || `<tr><td colspan="6">No completed tests yet.</td></tr>`}
        </tbody></table></div></div>`;
    }
    if (S.tab === "users") {
      return `<div class="panel"><h3>Registered Students (${S.users.length})</h3><div class="table-wrap"><table><thead><tr><th>Student</th><th>City</th><th>Free Used</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${S.users.map(u => `<tr><td><b>${esc(u.name)}</b><br><small>${esc(u.email)}</small></td><td>${esc(u.city || "—")}</td><td>${u.freePapersUsed}</td><td><span class="pill ${u.disabled ? "bad" : "good"}">${u.disabled ? "Disabled" : "Active"}</span></td><td><button class="btn ${u.disabled ? "btn-outline" : "btn-danger"}" data-toggle-user="${esc(u.id)}" data-disabled="${u.disabled ? "1" : "0"}">${u.disabled ? "Enable" : "Disable"}</button></td></tr>`).join("")}
      </tbody></table></div></div>`;
    }
    if (S.tab === "settings") {
      const s = S.overview?.settings || {};
      return `<div class="panel"><h3>Portal Settings</h3><form id="setForm" class="form">
        <label>Website Name<input class="ctrl" name="siteName" value="${esc(s.siteName || "Mintu Exam Hub")}" required></label>
        <div class="grid-2"><label>Free Papers Per Device<input class="ctrl" type="number" name="freePapersPerDevice" min="0" max="10" value="${Number(s.freePapersPerDevice ?? 1)}" required></label><label>Default Paper Price (₹)<input class="ctrl" type="number" name="defaultPaperPrice" min="0" value="${Number(s.defaultPaperPrice ?? 25)}" required></label></div>
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="announcementEnabled" ${s.announcementEnabled ? "checked" : ""}> Show Top Announcement Banner</label>
        <label>Announcement Text<input class="ctrl" name="announcementText" value="${esc(s.announcementText || "")}" placeholder="e.g. New HSSC CET 2026 questions added!"></label>
        <button class="btn btn-primary" type="submit">Save Settings</button>
      </form></div>`;
    }
    return "";
  }

  function bind() {
    $$("[data-tab]").forEach(b => b.addEventListener("click", async () => { S.tab = b.dataset.tab; await refresh(); render(); }));
    $("#aRefresh")?.addEventListener("click", async () => { await refresh(); render(); toast("Refreshed.", "success"); });
    $("#aLogout")?.addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST", body: "{}" }); loginView(); });

    $("#stopAiBtn")?.addEventListener("click", () => { S.aiStop = true; });
    $("#aiGenForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      if (S.aiRunning) return;
      const fd = new FormData(e.currentTarget);
      const target = Number(fd.get("targetTotal") || 25);
      const batchSize = 25;
      S.aiRunning = true; S.aiStop = false;
      let totalAdded = 0; let batch = 0;
      const totalBatches = Math.ceil(target / batchSize);
      render();
      try {
        while (totalAdded < target && !S.aiStop && batch < totalBatches + 3) {
          batch++;
          const need = Math.min(batchSize, target - totalAdded);
          S.aiStatus = `Batch ${batch}: Generating ${need} questions via ${fd.get("provider")}… (Saved so far: ${totalAdded}/${target})`;
          const prog = $("#aiProgress"); if (prog) prog.textContent = S.aiStatus; else render();
          const res = await api("/api/admin/questions/ai-generate", {
            method: "POST",
            body: JSON.stringify({
              paperId: fd.get("paperId"), provider: fd.get("provider"), apiKey: fd.get("apiKey"),
              model: fd.get("model"), topic: fd.get("topic"), language: fd.get("language"),
              difficulty: fd.get("difficulty"), count: need
            })
          });
          totalAdded += Number(res.inserted || 0);
        }
        S.aiStatus = `Done! Added ${totalAdded} unique questions to Supabase.`;
        toast(S.aiStatus, "success");
      } catch (err) {
        S.aiStatus = `Stopped after ${totalAdded} questions. Error: ${err.message}`;
        toast(err.message, "error");
      } finally {
        S.aiRunning = false;
        await refresh();
        render();
      }
    });

    $("#bulkForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      try {
        const list = JSON.parse(fd.get("json"));
        const res = await api("/api/admin/questions/bulk", { method: "POST", body: JSON.stringify({ paperId: fd.get("paperId"), questions: list }) });
        await refresh(); render(); toast(`Imported ${res.inserted} questions!`, "success");
      } catch (err) { toast(err.message, "error"); }
    });

    $("#paperForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
      try { await api("/api/admin/papers", { method: "POST", body: JSON.stringify(fd) }); await refresh(); render(); toast("Paper created!", "success"); }
      catch (err) { toast(err.message, "error"); }
    });
    $$("[data-toggle-paper]").forEach(b => b.addEventListener("click", async () => {
      await api(`/api/admin/papers/${encodeURIComponent(b.dataset.togglePaper)}`, { method: "PATCH", body: JSON.stringify({ active: b.dataset.active !== "1" }) });
      await refresh(); render(); toast("Paper updated.");
    }));
    $$("[data-del-paper]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Delete this paper and all its questions?")) return;
      await api(`/api/admin/papers/${encodeURIComponent(b.dataset.delPaper)}`, { method: "DELETE" });
      await refresh(); render(); toast("Paper deleted.");
    }));
    $("#qFilter")?.addEventListener("change", async e => { S.qFilterPaper = e.target.value; await refresh(); render(); });
    $$("[data-del-q]").forEach(b => b.addEventListener("click", async () => {
      await api(`/api/admin/questions/${encodeURIComponent(b.dataset.delQ)}`, { method: "DELETE" });
      await refresh(); render(); toast("Question deleted.");
    }));
    $$("[data-toggle-user]").forEach(b => b.addEventListener("click", async () => {
      await api(`/api/admin/users/${encodeURIComponent(b.dataset.toggleUser)}/status`, { method: "PATCH", body: JSON.stringify({ disabled: b.dataset.disabled !== "1" }) });
      await refresh(); render(); toast("User updated.");
    }));
    $("#exportLeads")?.addEventListener("click", () => {
      const rows = [["Name", "Email", "City", "Paper", "Score", "Accuracy", "Date"]];
      for (const a of S.attempts) rows.push([a.user_name, a.user_email, a.user_city, a.paper_id, `${a.score}/${a.total_questions}`, `${a.accuracy_percent}%`, a.submitted_at || a.started_at]);
      const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "exam_leads.csv"; a.click();
      URL.revokeObjectURL(url);
    });
    $("#setForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ siteName: fd.get("siteName"), freePapersPerDevice: Number(fd.get("freePapersPerDevice")), defaultPaperPrice: Number(fd.get("defaultPaperPrice")), announcementEnabled: fd.get("announcementEnabled") === "on", announcementText: fd.get("announcementText") }) });
      await refresh(); render(); toast("Settings saved!", "success");
    });
  }

  async function start() { await refresh(); render(); }
  api("/api/admin/me").then(r => r.authenticated ? start() : loginView()).catch(loginView);
})();
