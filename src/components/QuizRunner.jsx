import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function QuizRunner({ quiz, isPaidUser, onRequirePlan, onSubmitted, toast }) {
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const answersRef = useRef({});
  const [savedIds, setSavedIds] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(Number(quiz.paper.durationMinutes || 15) * 60);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [reporting, setReporting] = useState(false);

  function selectAnswer(qid, opt) {
    setAnswers(prev => {
      const next = { ...prev, [qid]: opt };
      answersRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && !submittingRef.current) {
      toast("Time is up! Submitting your saved answers…");
      handleSubmit(true);
    }
  }, [secondsLeft]);

  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const k = e.key.toUpperCase();
      const map = { "1": "A", "2": "B", "3": "C", "4": "D", A: "A", B: "B", C: "C", D: "D" };
      if (map[k]) {
        const q = quiz.questions[qIndex];
        if (q) selectAnswer(q.id, map[k]);
      } else if (e.key === "ArrowRight" && qIndex < quiz.questions.length - 1) {
        setQIndex(i => i + 1);
      } else if (e.key === "ArrowLeft" && qIndex > 0) {
        setQIndex(i => i - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qIndex, quiz.questions]);

  async function handleSubmit(auto = false) {
    if (submittingRef.current) return;
    const finalAnswers = answersRef.current;
    if (!auto && !confirm(`Submit test now? (${Object.keys(finalAnswers).length}/${quiz.questions.length} answered)`)) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await api(`/api/attempts/${encodeURIComponent(quiz.attemptId)}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers: finalAnswers })
      });
      toast(`Test submitted! Score: ${res.score}/${res.total}`, "success");
      onSubmitted(res);
    } catch (e) {
      toast(e.message, "error");
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function toggleSave(qid) {
    if (!isPaidUser) {
      toast("Save Questions is a Pro feature. Buy any Paper Plan to unlock!", "error");
      if (onRequirePlan) onRequirePlan();
      return;
    }
    const isSaved = Boolean(savedIds[qid]);
    setSavedIds(prev => ({ ...prev, [qid]: !isSaved }));
    try {
      await api(`/api/bookmarks/${encodeURIComponent(qid)}`, { method: isSaved ? "DELETE" : "POST", body: "{}" });
      toast(isSaved ? "Removed from Saved." : "Saved for revision ⭐", "success");
    } catch (e) {
      setSavedIds(prev => ({ ...prev, [qid]: isSaved }));
      toast(e.message, "error");
    }
  }

  async function reportQuestion(qid) {
    if (reporting) return;
    setReporting(true);
    try {
      await api(`/api/questions/${encodeURIComponent(qid)}/report`, { method: "POST", body: "{}" });
      toast("Question reported to admin. Thank you!", "success");
    } catch (e) { toast(e.message, "error"); }
    finally { setReporting(false); }
  }

  const q = quiz.questions[qIndex];
  const chosen = answers[q.id] || "";
  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secs = String(secondsLeft % 60).padStart(2, "0");
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="quiz-shell">
      <div className="quiz-head">
        <div>
          <b>{quiz.paper.title}</b>
          <div className="muted-sm">Question {qIndex + 1} of {quiz.questions.length} · {answeredCount} answered</div>
        </div>
        <div className={`timer-pill ${secondsLeft <= 60 ? "warn" : ""}`}>⏱ {mins}:{secs}</div>
      </div>

      <div className="quiz-layout">
        <section className="q-card">
          <div className="q-top">
            <span className="pill">{q.topic || "General"}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-outline btn-sm" onClick={() => toggleSave(q.id)}>
                {!isPaidUser ? "🔒 Save" : savedIds[q.id] ? "⭐ Saved" : "☆ Save"}
              </button>
              <button className="btn btn-outline btn-sm" disabled={reporting} onClick={() => reportQuestion(q.id)}>
                {reporting ? "…" : "🚩 Report"}
              </button>
            </div>
          </div>
          <div className="q-text">{q.question_text}</div>
          <div className="opt-list">
            {["A", "B", "C", "D"].map(k => (
              <button key={k} type="button" className={`opt-btn ${chosen === k ? "selected" : ""}`} onClick={() => selectAnswer(q.id, k)}>
                <span className="opt-key">{k}</span>
                <span>{q[`option_${k.toLowerCase()}`]}</span>
              </button>
            ))}
          </div>
          <div className="q-nav">
            <button className="btn btn-outline" disabled={qIndex === 0} onClick={() => setQIndex(i => i - 1)}>← Previous</button>
            {qIndex < quiz.questions.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setQIndex(i => i + 1)}>Next →</button>
            ) : (
              <button className="btn btn-primary" disabled={submitting} onClick={() => handleSubmit(false)}>
                {submitting ? <><span className="spinner" /> Submitting…</> : "Submit Test ✓"}
              </button>
            )}
          </div>
        </section>

        <aside className="palette-card">
          <b>Question Palette</b>
          <div className="palette-grid">
            {quiz.questions.map((item, idx) => (
              <button key={item.id} type="button" className={`p-dot ${answers[item.id] ? "answered" : ""} ${idx === qIndex ? "current" : ""}`} onClick={() => setQIndex(idx)}>
                {idx + 1}
              </button>
            ))}
          </div>
          <button className="btn btn-primary full" disabled={submitting} onClick={() => handleSubmit(false)}>
            {submitting ? <><span className="spinner" /> Grading…</> : `Finish & Submit (${answeredCount}/${quiz.questions.length})`}
          </button>
        </aside>
      </div>
    </div>
  );
}
