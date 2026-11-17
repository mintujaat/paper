import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function QuizRunner({ quiz, onSubmitted, toast }) {
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(Number(quiz.paper.durationMinutes || 15) * 60);
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function handleSubmit(auto = false) {
    if (submitting) return;
    if (!auto && !confirm(`Submit test now? (${Object.keys(answers).length}/${quiz.questions.length} answered)`)) return;
    setSubmitting(true);
    try {
      const res = await api(`/api/attempts/${encodeURIComponent(quiz.attemptId)}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers })
      });
      toast(`Test submitted! Score: ${res.score}/${res.total}`, "success");
      onSubmitted(res);
    } catch (e) {
      toast(e.message, "error");
      setSubmitting(false);
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
            <button className="btn btn-outline btn-sm" disabled={reporting} onClick={() => reportQuestion(q.id)}>
              {reporting ? "Reporting…" : "🚩 Report typo"}
            </button>
          </div>
          <div className="q-text">{q.question_text}</div>
          <div className="opt-list">
            {["A", "B", "C", "D"].map(k => (
              <button key={k} type="button" className={`opt-btn ${chosen === k ? "selected" : ""}`} onClick={() => setAnswers(prev => ({ ...prev, [q.id]: k }))}>
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
