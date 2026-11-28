import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getDeviceMeta } from "../api.js";
import { parseBulkQuestions } from "../utils/parseBulkQuestions.js";

const NAV_ITEMS = [
  ["overview", "Overview"],
  ["plans", "Paper Plans"],
  ["ai", "AI Generator"],
  ["papers", "Papers & Sponsors"],
  ["questions", "Question Bank"],
  ["attempts", "Attempts & Leads"],
  ["users", "Students"],
  ["suggestions", "Suggestions"],
  ["settings", "Settings"]
];

export default function AdminPanel({ toast, onExit }) {
  const [authed, setAuthed] = useState(null);
  const [blocked, setBlocked] = useState(() => {
    try {
      return localStorage.getItem("yaadpage_adm_blocked") === "1";
    } catch {
      return false;
    }
  });
  const [loginErr, setLoginErr] = useState("");
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [papers, setPapers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [users, setUsers] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [qFilter, setQFilter] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkPaperId, setBulkPaperId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const stopAiRef = useRef(false);

  const parsedBulk = useMemo(() => parseBulkQuestions(bulkText), [bulkText]);

  const loadTab = useCallback(
    async (t = tab) => {
      const jobs = [api("/api/admin/overview"), api("/api/admin/papers"), api("/api/admin/plans")];
      if (t === "questions") {
        jobs.push(
          api(`/api/admin/questions${qFilter ? `?paperId=${encodeURIComponent(qFilter)}` : ""}`)
        );
      }
      if (t === "users") jobs.push(api("/api/admin/users"));
      if (t === "attempts") jobs.push(api("/api/admin/attempts"));
      if (t === "suggestions") jobs.push(api("/api/admin/suggestions"));
      const res = await Promise.all(jobs);
      setOverview(res[0]);
      setPapers(res[1].papers || []);
      setPlans(res[2].plans || []);
      if (t === "questions") setQuestions(res[3].questions || []);
      if (t === "users") setUsers(res[3].users || []);
      if (t === "attempts") setAttempts(res[3].attempts || []);
      if (t === "suggestions") setSuggestions(res[3].suggestions || []);
    },
    [tab, qFilter]
  );

  useEffect(() => {
    if (blocked) {
      setAuthed(false);
      return;
    }
    const dm = getDeviceMeta();
    api(`/api/admin/me?deviceId=${encodeURIComponent(dm.deviceId)}`)
      .then(r => {
        if (r.blocked) {
          try {
            localStorage.setItem("yaadpage_adm_blocked", "1");
          } catch {}
          setBlocked(true);
          setAuthed(false);
          return;
        }
        setAuthed(r.authenticated);
        if (r.authenticated) loadTab("overview");
      })
      .catch(err => {
        if (err.status === 403 || err.data?.blocked) {
          try {
            localStorage.setItem("yaadpage_adm_blocked", "1");
          } catch {}
          setBlocked(true);
        }
        setAuthed(false);
      });
  }, []);

  useEffect(() => {
    if (authed) loadTab(tab);
  }, [tab, qFilter, authed]);

  async function handleLogin(e) {
    e.preventDefault();
    if (blocked) return;
    setLoginErr("");
    try {
      const dm = getDeviceMeta();
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          password: new FormData(e.currentTarget).get("password"),
          deviceId: dm.deviceId
        })
      });
      try {
        localStorage.removeItem("yaadpage_adm_blocked");
      } catch {}
      setAuthed(true);
      loadTab("overview");
    } catch (err) {
      if (err.status === 403 || err.data?.blocked) {
        try {
          localStorage.setItem("yaadpage_adm_blocked", "1");
        } catch {}
        setBlocked(true);
      }
      setLoginErr(err.message);
      toast(err.message, "error");
    }
  }

  async function handleAiGenerate(e) {
    e.preventDefault();
    if (aiRunning) return;
    const fd = new FormData(e.currentTarget);
    const target = Math.max(1, Number(fd.get("targetTotal") || 10));
    const batchSize = Math.max(1, Math.min(25, Number(fd.get("batchSize") || 10)));
    setAiRunning(true);
    stopAiRef.current = false;
    let totalAdded = 0;
    let batch = 0;
    const maxBatches = Math.ceil(target / batchSize) + 8;
    try {
      while (totalAdded < target && !stopAiRef.current && batch < maxBatches) {
        batch++;
        const need = Math.min(batchSize, target - totalAdded);
        setAiStatus(
          `Batch ${batch}: Generating ${need} Qs via ${fd.get("provider")}… (Saved: ${totalAdded}/${target})`
        );
        let res;
        const payload = {
          paperId: fd.get("paperId"),
          provider: fd.get("provider"),
          apiKey: fd.get("apiKey"),
          model: fd.get("model"),
          topic: fd.get("topic"),
          language: fd.get("language"),
          difficulty: fd.get("difficulty"),
          count: need
        };
        try {
          res = await api("/api/admin/questions/ai-generate", {
            method: "POST",
            body: JSON.stringify(payload)
          });
        } catch (err) {
          if (/429|quota|rate|limit/i.test(err.message) && !stopAiRef.current) {
            setAiStatus(`Rate limit hit — waiting 4s before retry… (Saved: ${totalAdded}/${target})`);
            await new Promise(r => setTimeout(r, 4000));
            res = await api("/api/admin/questions/ai-generate", {
              method: "POST",
              body: JSON.stringify(payload)
            });
          } else {
            throw err;
          }
        }
        const addedNow = Number(res?.inserted || 0);
        totalAdded += addedNow;
        setAiStatus(`Batch ${batch} saved +${addedNow} Qs! Total saved: ${totalAdded}/${target}`);
      }
      const msg = `Completed! Added ${totalAdded} unique questions to Supabase.`;
      setAiStatus(msg);
      toast(msg, "success");
      loadTab("ai");
    } catch (err) {
      setAiStatus(`Saved ${totalAdded} questions so far. Stopped: ${err.message}`);
      toast(err.message, "error");
    } finally {
      setAiRunning(false);
    }
  }

  async function handleBulkImport(e) {
    e.preventDefault();
    if (bulkBusy) return;
    const pid = bulkPaperId || papers[0]?.id || "";
    if (!pid) return toast("Create a paper first.", "error");
    if (!parsedBulk.length) {
      return toast("Could not detect valid questions. Check JSON, CSV, or Q/A/B/C/D/Ans format.", "error");
    }
    setBulkBusy(true);
    let inserted = 0;
    let skipped = 0;
    const chunkSize = 250;
    try {
      for (let i = 0; i < parsedBulk.length; i += chunkSize) {
        const chunk = parsedBulk.slice(i, i + chunkSize);
        setBulkStatus(`Uploading ${Math.min(i + chunk.length, parsedBulk.length)} / ${parsedBulk.length} questions…`);
        const res = await api("/api/admin/questions/bulk", {
          method: "POST",
          body: JSON.stringify({ paperId: pid, questions: chunk })
        });
        inserted += Number(res.inserted || 0);
        skipped += Number(res.skippedDuplicates || 0);
      }
      const msg = `Imported ${inserted} unique questions! (${skipped} duplicates skipped)`;
      setBulkStatus(msg);
      toast(msg, "success");
      setBulkText("");
      loadTab("questions");
    } catch (err) {
      setBulkStatus(`Stopped: ${err.message}`);
      toast(err.message, "error");
    } finally {
      setBulkBusy(false);
    }
  }

  if (authed === null) {
    return (
      <div className="boot">
        <span className="spinner dark" />
        <p>Checking admin session…</p>
      </div>
    );
  }

  if (!authed) {
    if (blocked) {
      return (
        <div className="auth-center">
          <div className="modal-card" style={{ textAlign: "center" }}>
            <span className="eyebrow" style={{ color: "var(--red)" }}>
              403 · ACCESS BLOCKED
            </span>
            <h2>Admin Panel Locked</h2>
            <p className="muted-sm">
              Too many incorrect password attempts (3/3). Your IP address and device are permanently
              blocked from accessing the Admin Panel.
            </p>
            <button type="button" className="btn btn-primary full" onClick={onExit}>
              ← Back to Student Site
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="auth-center">
        <form className="modal-card" onSubmit={handleLogin}>
          <span className="eyebrow">ADMIN WORKSPACE</span>
          <h2>Sign in to Admin</h2>
          <p className="muted-sm" style={{ marginTop: 0 }}>
            Max 3 attempts allowed. 3 wrong passwords will block your IP &amp; device.
          </p>
          <input className="ctrl" type="password" name="password" required placeholder="Enter ADMIN_PASSWORD" />
          {loginErr && <div className="err">{loginErr}</div>}
          <button className="btn btn-primary btn-lg full" type="submit">
            Open Dashboard →
          </button>
          <button type="button" className="btn btn-ghost full" onClick={onExit}>
            ← Back to Student Site
          </button>
        </form>
      </div>
    );
  }

  const s = overview?.stats || {};
  const set = overview?.settings || {};

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="brand">
          <span className="logo-mark">Y</span>
          <div>
            <b>YaadPage</b>
            <small>ADMIN PANEL</small>
          </div>
        </div>
        <div className="admin-nav">
          {NAV_ITEMS.map(([id, label]) => (
            <button
              key={id}
              className={`admin-nav-btn ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="admin-side-foot">
          <button className="btn btn-outline btn-sm full" onClick={onExit}>
            ↗ Student Site
          </button>
          <button
            className="btn btn-ghost btn-sm full"
            style={{ color: "var(--red)" }}
            onClick={async () => {
              await api("/api/admin/logout", { method: "POST", body: "{}" });
              setAuthed(false);
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-head">
          <h1>{NAV_ITEMS.find(n => n[0] === tab)?.[1]}</h1>
          <button className="btn btn-outline btn-sm" onClick={() => loadTab(tab)}>
            ↻ Refresh
          </button>
        </div>

        {tab === "overview" && (
          <div className="stack fade-in">
            <div className="kpi-grid">
              <div className="kpi"><span>Visitors</span><b>{s.totalVisitors || 0}</b><small>{s.todayVisitors || 0} today</small></div>
              <div className="kpi"><span>Students</span><b>{s.users || 0}</b><small>Registered</small></div>
              <div className="kpi"><span>Question Bank</span><b>{s.questions || 0}</b><small>{s.papers || 0} papers</small></div>
              <div className="kpi"><span>Tests Taken</span><b>{s.attempts || 0}</b><small>Completed</small></div>
              <div className="kpi"><span>Revenue</span><b>₹{Number(s.revenue || 0).toFixed(2)}</b><small>Razorpay plans</small></div>
            </div>
            <div className="panel">
              <h3>Quick Setup Guide</h3>
              <p className="muted-sm">
                1. Configure credit packs under <b>Paper Plans</b> (default: 1 Paper ₹25, 5 Papers ₹50, 15 Papers ₹100).<br />
                2. Use <b>AI Generator</b> to select a paper, choose Gemini/OpenAI/Groq/OpenRouter, paste your API key, and auto-load 1,000+ questions into Supabase.
              </p>
            </div>
          </div>
        )}

        {tab === "plans" && (
          <div className="stack fade-in">
            <div className="panel">
              <h3>Create Paper Pack Plan</h3>
              <form
                className="stack"
                onSubmit={async e => {
                  e.preventDefault();
                  const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
                  try {
                    await api("/api/admin/plans", { method: "POST", body: JSON.stringify(fd) });
                    e.currentTarget.reset();
                    loadTab("plans");
                    toast("Plan created!", "success");
                  } catch (err) {
                    toast(err.message, "error");
                  }
                }}
              >
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
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Title</th><th>Papers</th><th>Price</th><th>Badge</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div className="stack fade-in">
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
                  <label className="field"><span>Total Questions to Add</span><select className="ctrl" name="targetTotal" defaultValue="25"><option value="1">1 Question</option><option value="5">5 Questions</option><option value="10">10 Questions</option><option value="15">15 Questions</option><option value="20">20 Questions</option><option value="25">25 Questions</option><option value="50">50 Questions</option><option value="100">100 Questions</option><option value="250">250 Questions</option><option value="500">500 Questions</option><option value="1000">1,000 Questions</option></select></label>
                </div>
                <div className="grid-2">
                  <label className="field"><span>Questions Per API Call (Batch Size)</span><select className="ctrl" name="batchSize" defaultValue="10"><option value="5">5 Qs / call (Safest for Free Gemini)</option><option value="10">10 Qs / call (Recommended)</option><option value="15">15 Qs / call</option><option value="20">20 Qs / call</option><option value="25">25 Qs / call (Fastest)</option></select></label>
                  <div className="field" style={{ justifyContent: "end" }}><small className="muted-sm">Jitne bhi valid sawal aayenge (chahe 1 hi kyun na ho), turant Supabase mein save ho jayenge.</small></div>
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
          <div className="stack fade-in">
            <div className="panel">
              <h3>Create Exam Paper</h3>
              <form
                className="stack"
                onSubmit={async e => {
                  e.preventDefault();
                  const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
                  try {
                    await api("/api/admin/papers", { method: "POST", body: JSON.stringify(fd) });
                    e.currentTarget.reset();
                    loadTab("papers");
                    toast("Paper created!", "success");
                  } catch (err) {
                    toast(err.message, "error");
                  }
                }}
              >
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
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Title</th><th>Bank Qs</th><th>Sponsor</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "questions" && (
          <div className="stack fade-in">
            <div className="panel">
              <div className="admin-head" style={{ marginBottom: 8 }}>
                <div>
                  <h3>⚡ Bulk Import 1,000+ Questions (Zero API Key)</h3>
                  <small className="muted-sm">Upload CSV / JSON / TXT file OR paste questions directly from free ChatGPT / Gemini Web.</small>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const pTitle = papers.find(x => x.id === (bulkPaperId || papers[0]?.id))?.title || "HSSC / SSC Exam";
                      const promptTxt = `Generate 100 unique MCQs for "${pTitle}" in Bilingual (English + Hindi) as a JSON array with exact keys: question_text, option_a, option_b, option_c, option_d, correct_option (A/B/C/D), explanation, topic. Output ONLY valid JSON.`;
                      navigator.clipboard?.writeText(promptTxt);
                      toast("Prompt copied! Paste it in free ChatGPT/Gemini web, then paste output below.", "success");
                    }}
                  >📋 Copy Free AI Prompt</button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const sample = 'question_text,option_a,option_b,option_c,option_d,correct_option,explanation,topic\n"When was Haryana formed?","1 Nov 1966","15 Aug 1947","26 Jan 1950","1 Nov 1967","A","Haryana was carved out of Punjab on 1 Nov 1966.","Haryana GK"';
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
                      a.download = "yaadpage_sample.csv";
                      a.click();
                    }}
                  >⬇ Sample CSV</button>
                </div>
              </div>
              <form className="stack" onSubmit={handleBulkImport}>
                <div className="grid-2">
                  <label className="field">
                    <span>Target Paper</span>
                    <select className="ctrl" value={bulkPaperId || papers[0]?.id || ""} onChange={e => setBulkPaperId(e.target.value)}>
                      {papers.map(p => <option key={p.id} value={p.id}>{p.title} ({p.questionCount} Qs)</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Upload .csv / .json / .txt File</span>
                    <input
                      className="ctrl"
                      type="file"
                      accept=".csv,.json,.txt"
                      style={{ paddingTop: 8 }}
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const txt = await file.text();
                        setBulkText(txt);
                        toast(`Loaded ${file.name} (${parseBulkQuestions(txt).length} questions detected)`, "success");
                      }}
                    />
                  </label>
                </div>
                <textarea
                  className="ctrl"
                  rows={5}
                  style={{ padding: 12, minHeight: 110 }}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder="Paste JSON, CSV, or plain text (1. Question? A) ... B) ... C) ... D) ... Ans: A)"
                />
                {bulkStatus && <div className="notice-banner">{bulkStatus}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <small className="muted-sm">
                    Detected: <b>{parsedBulk.length}</b> valid questions (auto-splits in 250-Q batches &amp; skips duplicates)
                  </small>
                  <button className="btn btn-primary" type="submit" disabled={bulkBusy || !bulkText.trim()}>
                    {bulkBusy ? "Importing…" : "Import Questions to Supabase →"}
                  </button>
                </div>
              </form>
            </div>

            <div className="panel">
              <div className="admin-head" style={{ marginBottom: 12 }}>
                <h3>Question Bank (Latest 200)</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={async () => {
                      const res = await api("/api/admin/questions/dedup", { method: "POST", body: JSON.stringify({ paperId: qFilter }) });
                      toast(`Removed ${res.removed || 0} duplicate questions!`, "success");
                      loadTab("questions");
                    }}
                  >🧹 Clean Duplicates</button>
                  <select className="ctrl" style={{ maxWidth: 220 }} value={qFilter} onChange={e => setQFilter(e.target.value)}>
                    <option value="">All Papers</option>
                    {papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Question</th><th>Paper</th><th>Ans</th><th>Reports</th><th>Action</th></tr></thead>
                  <tbody>
                    {questions.map(q => (
                      <tr key={q.id}>
                        <td><b>{q.question_text}</b></td>
                        <td>{q.paper_id}</td>
                        <td><span className="pill good">{q.correct_option}</span></td>
                        <td>{q.reported_count > 0 ? <span className="pill bad">🚩 {q.reported_count}</span> : "0"}</td>
                        <td><button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => { await api(`/api/admin/questions/${encodeURIComponent(q.id)}`, { method: "DELETE" }); loadTab("questions"); }}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "attempts" && (
          <div className="panel fade-in">
            <div className="admin-head" style={{ marginBottom: 12 }}>
              <h3>Completed Attempts &amp; Sponsor Leads</h3>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const rows = [["Name", "Email", "City", "Paper", "Score", "Accuracy", "Date"]];
                  attempts.forEach(a => rows.push([a.user_name, a.user_email, a.user_city, a.paper_id, `${a.score}/${a.total_questions}`, `${a.accuracy_percent}%`, a.submitted_at || a.started_at]));
                  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  a.download = "exam_leads.csv";
                  a.click();
                }}
              >⬇ Export Leads CSV</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>City</th><th>Paper</th><th>Score</th><th>Type</th></tr></thead>
                <tbody>
                  {attempts.map(a => (
                    <tr key={a.id}><td><b>{a.user_name}</b><br /><small>{a.user_email}</small></td><td>{a.user_city || "—"}</td><td>{a.paper_id}</td><td><b>{a.score}/{a.total_questions}</b> ({a.accuracy_percent}%)</td><td>{a.is_free ? "Free" : "Credit"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "users" && (
          <div className="panel fade-in">
            <h3>Students ({users.length})</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>City</th><th>Credits</th><th>Free Used</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
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
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "suggestions" && (
          <div className="panel fade-in">
            <h3>Student Suggestions ({suggestions.length})</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Category</th><th>Suggestion</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {suggestions.map(sg => (
                    <tr key={sg.id}>
                      <td><b>{sg.user_name}</b><br /><small>{sg.user_email || "—"}</small></td>
                      <td><span className="pill">{sg.category}</span></td>
                      <td style={{ maxWidth: 360 }}>{sg.message}</td>
                      <td><span className={`pill ${sg.status === "done" ? "good" : ""}`}>{sg.status === "done" ? "Done" : "New"}</span></td>
                      <td>
                        {sg.status !== "done" && (
                          <button className="btn btn-outline btn-sm" onClick={async () => { await api(`/api/admin/suggestions/${encodeURIComponent(sg.id)}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }); loadTab("suggestions"); }}>Mark Done</button>
                        )}{" "}
                        <button className="btn btn-outline btn-sm" style={{ color: "var(--red)" }} onClick={async () => { await api(`/api/admin/suggestions/${encodeURIComponent(sg.id)}`, { method: "DELETE" }); loadTab("suggestions"); }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {!suggestions.length && <tr><td colSpan={5} style={{ textAlign: "center", padding: 24 }}>No suggestions received yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="panel fade-in">
            <h3>Portal Settings</h3>
            <form
              className="stack"
              onSubmit={async e => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                await api("/api/admin/settings", {
                  method: "PUT",
                  body: JSON.stringify({
                    siteName: fd.get("siteName"),
                    freePapersPerDevice: Number(fd.get("freePapersPerDevice")),
                    defaultPaperPrice: Number(fd.get("defaultPaperPrice")),
                    announcementEnabled: fd.get("announcementEnabled") === "on",
                    announcementText: fd.get("announcementText")
                  })
                });
                loadTab("settings");
                toast("Settings saved!", "success");
              }}
            >
              <label className="field"><span>Site Name</span><input className="ctrl" name="siteName" defaultValue={set.siteName || "YaadPage"} required /></label>
              <div className="grid-2">
                <label className="field"><span>Free Papers Per Device</span><input className="ctrl" type="number" name="freePapersPerDevice" defaultValue={set.freePapersPerDevice ?? 1} required /></label>
                <label className="field"><span>Default Single Price (₹)</span><input className="ctrl" type="number" name="defaultPaperPrice" defaultValue={set.defaultPaperPrice ?? 25} required /></label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                <input type="checkbox" name="announcementEnabled" defaultChecked={set.announcementEnabled} /> Show Top Announcement Banner
              </label>
              <input className="ctrl" name="announcementText" defaultValue={set.announcementText || ""} placeholder="Announcement message" />
              <button className="btn btn-primary" type="submit">Save Settings</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
