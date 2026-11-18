import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function AdminPanel({ toast, onExit }) {
  const [authed, setAuthed] = useState(null);
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [papers, setPapers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [users, setUsers] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [qFilter, setQFilter] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const stopAiRef = useRef(false);

  async function loadTab(t = tab) {
    const jobs = [api("/api/admin/overview"), api("/api/admin/papers"), api("/api/admin/plans")];
    if (t === "questions") jobs.push(api(`/api/admin/questions${qFilter ? `?paperId=${encodeURIComponent(qFilter)}` : ""}`));
    if (t === "users") jobs.push(api("/api/admin/users"));
    if (t === "attempts") jobs.push(api("/api/admin/attempts"));
    const res = await Promise.all(jobs);
    setOverview(res[0]);
    setPapers(res[1].papers || []);
    setPlans(res[2].plans || []);
    if (t === "questions") setQuestions(res[3].questions || []);
    if (t === "users") setUsers(res[3].users || []);
    if (t === "attempts") setAttempts(res[3].attempts || []);
  }

  useEffect(() => {
    api("/api/admin/me").then(r => {
      setAuthed(r.authenticated);
      if (r.authenticated) loadTab("overview");
    }).catch(() => setAuthed(false));
  }, []);

  useEffect(() => { if (authed) loadTab(tab); }, [tab, qFilter]);

  async function handleLogin(e) {
    e.preventDefault();
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: new FormData(e.currentTarget).get("password") }) });
      setAuthed(true);
      loadTab("overview");
    } catch (err) { toast(err.message, "error"); }
  }

  async function handleAiGenerate(e) {
    e.preventDefault();
    if (aiRunning) return;
    const fd = new FormData(e.currentTarget);
    const target = Number(fd.get("targetTotal") || 25);
    const batchSize = 25;
    setAiRunning(true);
    stopAiRef.current = false;
    let totalAdded = 0; let batch = 0;
    try {
      while (totalAdded < target && !stopAiRef.current && batch < Math.ceil(target / batchSize) + 4) {
        batch++;
        const need = Math.min(batchSize, target - totalAdded);
        setAiStatus(`Batch ${batch}: Generating ${need} questions via ${fd.get("provider")}… (Saved: ${totalAdded}/${target})`);
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
      const msg = `Completed! Added ${totalAdded} unique questions to Supabase.`;
      setAiStatus(msg);
      toast(msg, "success");
      loadTab("ai");
    } catch (err) {
      setAiStatus(`Stopped at ${totalAdded} questions. Error: ${err.message}`);
      toast(err.message, "error");
    } finally { setAiRunning(false); }
  }

  if (authed === null) return <div className="boot"><span className="spinner" /><p>Checking admin session…</p></div>;
  if (!authed) {
    return (
      <div className="auth-center">
        <form className="modal-card" onSubmit={handleLogin}>
          <span className="eyebrow">ADMIN WORKSPACE</span>
          <h2>Sign in to Admin</h2>
          <input className="ctrl" type="password" name="password" required placeholder="Enter ADMIN_PASSWORD" />
          <button className="btn btn-primary btn-lg full" type="submit">Open Dashboard →</button>
          <button type="button" className="btn btn-ghost full" onClick={onExit}>← Back to Student Site</button>
        </form>
      </div>
    );
  }

  const s = overview?.stats || {};
  const set = overview?.settings || {};
  const navItems = [
    ["overview", "Overview"],
    ["plans", "Paper Plans"],
    ["ai", "AI Generator"],
    ["papers", "Papers & Sponsors"],
    ["questions", "Question Bank"],
    ["attempts", "Attempts & Leads"],
    ["users", "Students"],
    ["settings", "Settings"]
  ];

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="brand"><span className="logo-mark">Y</span><div><b>YaadPage</b><small>ADMIN PANEL</small></div></div>
        <div className="admin-nav">
          {navItems.map(([id, label]) => (
            <button key={id} className={`admin-nav-btn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="admin-side-foot">
          <button className="btn btn-outline btn-sm full" onClick={onExit}>↗ Student Site</button>
          <button className="btn btn-ghost btn-sm full" style={{ color: "var(--red)" }} onClick={async () => { await api("/api/admin/logout", { method: "POST", body: "{}" }); setAuthed(false); }}>Logout</button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-head">
          <h1>{navItems.find(n => n[0] === tab)?.[1]}</h1>
          <button className="btn btn-outline btn-sm" onClick={() => loadTab(tab)}>↻ Refresh</button>
        </div>

        {tab === "overview" && (
          <div className="stack">
            <div className="kpi-grid">
              <div className="kpi"><span>Visitors</span><b>{s.totalVisitors || 0}</b><small>{s.todayVisitors || 0} today</small></div>
              <div className="kpi"><span>Students</span><b>{s.users || 0}</b><small>Registered</small></div>
              <div className="kpi"><span>Question Bank</span><b>{s.questions || 0}</b><small>{s.papers || 0} papers</small></div>
              <div className="kpi"><span>Tests Taken</span><b>{s.attempts || 0}</b><small>Completed</small></div>
              <div className="kpi"><span>Revenue</span><b>₹{Number(s.revenue || 0).toFixed(2)}</b><small>Razorpay plans</small></div>
            </div>
            <div className="panel">
              <h3>Quick Setup Guide</h3>
              <p className="muted-sm">1. Configure credit packs under <b>Paper Plans</b> (default: 1 Paper ₹25, 5 Papers ₹50, 15 Papers ₹100).<br />2. Use <b>AI Generator</b> to select a paper, choose Gemini/OpenAI/Groq/OpenRouter, paste your API key, and auto-load 1,000+ questions into Supabase.</p>
            </div>
          </div>
        )}

        {tab === "plans" && (
          <div className="stack">
            <div className="panel">
              <h3>Create Paper Pack Plan</h3>
              <form className="stack" onSubmit={async e => {
                e.preventDefault();
                const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
                try { await api("/api/admin/plans", { method: "POST", body: JSON.stringify(fd) }); e.currentTarget.reset(); loadTab("plans"); toast("Plan created!", "success"); }
                catch (err) { toast(err.message, "error"); }
              }}>
                <div className="grid-2">
                  <input className="ctrl" name="title" required placeholder="Plan Title (e.g. 5 Papers Value Pack)" />
                  <input className="ctrl" name="badge" placeholder="Badge (e.g. Popular · Save 60%)" />
                </div>
                <div className="grid-2">
                  <input className="ctrl" type="number" name="papersCount" min="1" required placeholder="Number of Papers (e.g. 5)" />
                  <input className="ctrl" type="number" name="priceInr" min="1" step="0.01" required placeholder="Price in ₹ (e.g. 50)" />
                </div>
                <button className="btn btn-primary" type="submit">Add Plan ＋</button>
              </form>
            </div>
            <div className="panel">
              <h3>Active &amp; Paused Plans ({plans.length})</h3>
              <div className="table-wrap"><table><thead><tr><th>Title</th><th>Papers</th><th>Price</th><th>Badge</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {plans.map(pl => (
                  <tr key={pl.id}>
                    <td><b>{pl.title}</b></td>
                    <td>{pl.papers_count}</td>
                    <td><b>₹{Number(pl.price_inr)}</b></td>
                    <td>{pl.badge || "—"}</td>
                    <td><span className={`pill ${pl.active ? "good" : "bad"}`}>{pl.active ? "Active" : "Paused"}</span></td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={async () => { await api(`/api/admin/plans/${encodeURIComponent(pl.id)}`, { method: "PATCH", body: JSON.stringify({ active: !pl.active }) }); loadTab("plans"); }}>{pl.active ? "Pause" : "Activate"}</button>{" "}
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => { if (confirm("Delete plan?")) { await api(`/api/admin/plans/${encodeURIComponent(pl.id)}`, { method: "DELETE" }); loadTab("plans"); } }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div className="stack">
            <div className="panel">
              <h3>🤖 AI Question Bank Generator (Auto-Save to Supabase)</h3>
              <form className="stack" onSubmit={handleAiGenerate}>
                <div className="grid-2">
                  <label className="field"><span>Select Exam Paper</span><select className="ctrl" name="paperId" required>{papers.map(p => <option key={p.id} value={p.id}>{p.title} ({p.questionCount} Qs)</option>)}</select></label>
                  <label className="field"><span>Select AI Agent</span><select className="ctrl" name="provider"><option value="gemini">Google Gemini (gemini-2.5-flash)</option><option value="openai">OpenAI (gpt-4o-mini)</option><option value="groq">Groq (llama-3.3-70b-versatile)</option><option value="openrouter">OpenRouter (gemini-2.0-flash)</option></select></label>
                </div>
                <div className="grid-2">
                  <label className="field"><span>Agent API Key</span><input className="ctrl" type="password" name="apiKey" required placeholder="Paste API Key" /></label>
                  <label className="field"><span>Custom Model (optional)</span><input className="ctrl" name="model" placeholder="Default fast model" /></label>
                </div>
                <div className="grid-2">
                  <label className="field"><span>Topic / Syllabus</span><input className="ctrl" name="topic" defaultValue="Full Syllabus (GK, Maths, Reasoning, Hindi/English)" required /></label>
                  <label className="field"><span>Language</span><select className="ctrl" name="language"><option>Bilingual (English + Hindi)</option><option>Hindi</option><option>English</option></select></label>
                </div>
                <div className="grid-2">
                  <label className="field"><span>Difficulty</span><select className="ctrl" name="difficulty"><option value="medium">Medium</option><option value="easy">Easy</option><option value="hard">Hard</option></select></label>
                  <label className="field"><span>Questions to Add</span><select className="ctrl" name="targetTotal" defaultValue="100"><option value="25">25 Questions</option><option value="50">50 Questions</option><option value="100">100 Questions</option><option value="250">250 Questions</option><option value="500">500 Questions</option><option value="1000">1,000 Questions</option></select></label>
                </div>
                {aiStatus && <div className="notice-banner">{aiStatus}</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-primary" type="submit" disabled={aiRunning}>{aiRunning ? "Generating…" : "Generate & Save to Supabase →"}</button>
                  {aiRunning && <button className="btn btn-outline" type="button" style={{ color: "var(--red)" }} onClick={() => { stopAiRef.current = true; }}>Stop</button>}
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === "papers" && (
          <div className="stack">
            <div className="panel">
              <h3>Create Exam Paper</h3>
              <form className="stack" onSubmit={async e => {
                e.preventDefault();
                const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
                try { await api("/api/admin/papers", { method: "POST", body: JSON.stringify(fd) }); e.currentTarget.reset(); loadTab("papers"); toast("Paper created!", "success"); }
                catch (err) { toast(err.message, "error"); }
              }}>
                <div className="grid-2"><input className="ctrl" name="title" required placeholder="Paper Title" /><input className="ctrl" name="category" defaultValue="HSSC" required placeholder="Category" /></div>
                <input className="ctrl" name="description" placeholder="Short description" />
                <div className="grid-2"><input className="ctrl" type="number" name="durationMinutes" defaultValue="15" required placeholder="Duration (mins)" /><input className="ctrl" type="number" name="questionsPerAttempt" defaultValue="25" required placeholder="Questions per attempt" /></div>
                <div className="grid-2"><input className="ctrl" name="sponsorName" placeholder="Sponsor Coaching Name (optional)" /><input className="ctrl" name="sponsorTagline" placeholder="Sponsor Tagline (optional)" /></div>
                <input className="ctrl" name="sponsorLink" placeholder="Sponsor WhatsApp / Website Link" />
                <button className="btn btn-primary" type="submit">Create Paper ＋</button>
              </form>
            </div>
            <div className="panel">
              <h3>All Papers ({papers.length})</h3>
              <div className="table-wrap"><table><thead><tr><th>Title</th><th>Bank Qs</th><th>Sponsor</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {papers.map(p => (
                  <tr key={p.id}>
                    <td><b>{p.title}</b><br /><small>{p.category} · {p.duration_minutes}m / {p.questions_per_attempt} Qs</small></td>
                    <td><b>{p.questionCount}</b></td>
                    <td>{p.sponsor_name || "—"}</td>
                    <td><span className={`pill ${p.active ? "good" : "bad"}`}>{p.active ? "Active" : "Paused"}</span></td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={async () => { await api(`/api/admin/papers/${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ active: !p.active }) }); loadTab("papers"); }}>{p.active ? "Pause" : "Activate"}</button>{" "}
                      <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => { if (confirm("Delete paper?")) { await api(`/api/admin/papers/${encodeURIComponent(p.id)}`, { method: "DELETE" }); loadTab("papers"); } }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody></table></div>
            </div>
          </div>
        )}

        {tab === "questions" && (
          <div className="panel">
            <div className="admin-head" style={{ marginBottom: 12 }}>
              <h3>Question Bank (Latest 200)</h3>
              <select className="ctrl" style={{ maxWidth: 240 }} value={qFilter} onChange={e => setQFilter(e.target.value)}>
                <option value="">All Papers</option>
                {papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="table-wrap"><table><thead><tr><th>Question</th><th>Paper</th><th>Ans</th><th>Reports</th><th>Action</th></tr></thead><tbody>
              {questions.map(q => (
                <tr key={q.id}>
                  <td><b>{q.question_text}</b></td>
                  <td>{q.paper_id}</td>
                  <td><span className="pill good">{q.correct_option}</span></td>
                  <td>{q.reported_count > 0 ? <span className="pill bad">🚩 {q.reported_count}</span> : "0"}</td>
                  <td><button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => { await api(`/api/admin/questions/${encodeURIComponent(q.id)}`, { method: "DELETE" }); loadTab("questions"); }}>Delete</button></td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        )}

        {tab === "attempts" && (
          <div className="panel">
            <div className="admin-head" style={{ marginBottom: 12 }}>
              <h3>Completed Attempts &amp; Sponsor Leads</h3>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const rows = [["Name", "Email", "City", "Paper", "Score", "Accuracy", "Date"]];
                attempts.forEach(a => rows.push([a.user_name, a.user_email, a.user_city, a.paper_id, `${a.score}/${a.total_questions}`, `${a.accuracy_percent}%`, a.submitted_at || a.started_at]));
                const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "exam_leads.csv"; a.click();
              }}>⬇ Export Leads CSV</button>
            </div>
            <div className="table-wrap"><table><thead><tr><th>Student</th><th>City</th><th>Paper</th><th>Score</th><th>Type</th></tr></thead><tbody>
              {attempts.map(a => (
                <tr key={a.id}><td><b>{a.user_name}</b><br /><small>{a.user_email}</small></td><td>{a.user_city || "—"}</td><td>{a.paper_id}</td><td><b>{a.score}/{a.total_questions}</b> ({a.accuracy_percent}%)</td><td>{a.is_free ? "Free" : "Credit"}</td></tr>
              ))}
            </tbody></table></div>
          </div>
        )}

        {tab === "users" && (
          <div className="panel">
            <h3>Students ({users.length})</h3>
            <div className="table-wrap"><table><thead><tr><th>Student</th><th>City</th><th>Credits</th><th>Free Used</th><th>Status</th><th>Action</th></tr></thead><tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.name}</b><br /><small>{u.email}</small></td>
                  <td>{[u.city, u.state].filter(Boolean).join(", ") || "—"}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <b>{u.paperCredits || 0}</b>
                      <button className="btn btn-outline btn-sm" title="Add 1 credit" onClick={async () => { await api(`/api/admin/users/${encodeURIComponent(u.id)}/credits`, { method: "POST", body: JSON.stringify({ delta: 1 }) }); loadTab("users"); toast("+1 credit added", "success"); }}>+1</button>
                      <button className="btn btn-outline btn-sm" title="Add 5 credits" onClick={async () => { await api(`/api/admin/users/${encodeURIComponent(u.id)}/credits`, { method: "POST", body: JSON.stringify({ delta: 5 }) }); loadTab("users"); toast("+5 credits added", "success"); }}>+5</button>
                      <button className="btn btn-outline btn-sm" title="Remove 1 credit" onClick={async () => { await api(`/api/admin/users/${encodeURIComponent(u.id)}/credits`, { method: "POST", body: JSON.stringify({ delta: -1 }) }); loadTab("users"); toast("1 credit removed"); }}>-1</button>
                    </div>
                  </td>
                  <td>{u.freePapersUsed}</td>
                  <td><span className={`pill ${u.disabled ? "bad" : "good"}`}>{u.disabled ? "Disabled" : "Active"}</span></td>
                  <td><button className="btn btn-outline btn-sm" onClick={async () => { await api(`/api/admin/users/${encodeURIComponent(u.id)}/status`, { method: "PATCH", body: JSON.stringify({ disabled: !u.disabled }) }); loadTab("users"); }}>{u.disabled ? "Enable" : "Disable"}</button></td>
                </tr>
              ))}
            </tbody></table></div>
          </div>
        )}

        {tab === "settings" && (
          <div className="panel">
            <h3>Portal Settings</h3>
            <form className="stack" onSubmit={async e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ siteName: fd.get("siteName"), freePapersPerDevice: Number(fd.get("freePapersPerDevice")), defaultPaperPrice: Number(fd.get("defaultPaperPrice")), announcementEnabled: fd.get("announcementEnabled") === "on", announcementText: fd.get("announcementText") }) });
              loadTab("settings"); toast("Settings saved!", "success");
            }}>
              <label className="field"><span>Site Name</span><input className="ctrl" name="siteName" defaultValue={set.siteName || "YaadPage"} required /></label>
              <div className="grid-2">
                <label className="field"><span>Free Papers Per Device</span><input className="ctrl" type="number" name="freePapersPerDevice" defaultValue={set.freePapersPerDevice ?? 1} required /></label>
                <label className="field"><span>Default Single Price (₹)</span><input className="ctrl" type="number" name="defaultPaperPrice" defaultValue={set.defaultPaperPrice ?? 25} required /></label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}><input type="checkbox" name="announcementEnabled" defaultChecked={set.announcementEnabled} /> Show Top Announcement Banner</label>
              <input className="ctrl" name="announcementText" defaultValue={set.announcementText || ""} placeholder="Announcement message" />
              <button className="btn btn-primary" type="submit">Save Settings</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
