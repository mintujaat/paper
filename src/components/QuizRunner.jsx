import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const QuizTimer = memo(function QuizTimer({ initialSeconds, onExpire, paused }) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (paused) return;
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
  }, [paused]);

  useEffect(() => {
    if (secondsLeft === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
  }, [secondsLeft, onExpire]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className={`timer-pill ${secondsLeft <= 60 ? "warn" : ""}`}>
      ⏱ {mins}:{secs}
    </div>
  );
});

const PaletteDot = memo(function PaletteDot({ idx, answered, current, onJump }) {
  return (
    <button
      type="button"
      className={`p-dot ${answered ? "answered" : ""} ${current ? "current" : ""}`}
      onClick={() => onJump(idx)}
    >
      {idx + 1}
    </button>
  );
});

export default function QuizRunner({ quiz, isPaidUser, onRequirePlan, onSubmitted, toast }) {
  const storageKey = `yp_quiz_${quiz.attemptId}`;
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const answersRef = useRef(answers);
  const [savedIds, setSavedIds] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [reporting, setReporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectAnswer = useCallback(
    (qid, opt) => {
      setAnswers(prev => {
        const next = { ...prev, [qid]: opt };
        answersRef.current = next;
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [storageKey]
  );

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (submittingRef.current) return;
      if (!auto) {
        setConfirmOpen(true);
        return;
      }
      setConfirmOpen(false);
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const res = await api(`/api/attempts/${encodeURIComponent(quiz.attemptId)}/submit`, {
          method: "POST",
          body: JSON.stringify({ answers: answersRef.current })
        });
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        toast(`Test submitted! Score: ${res.score}/${res.total}`, "success");
        onSubmitted(res);
      } catch (e) {
        toast(e.message, "error");
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [quiz.attemptId, storageKey, toast, onSubmitted]
  );

  const handleTimeExpire = useCallback(() => {
    if (!submittingRef.current) {
      toast("Time is up! Submitting your saved answers…");
      handleSubmit(true);
    }
  }, [toast, handleSubmit]);

  useEffect(() => {
    const onKey = e => {
      if (confirmOpen) {
        if (e.key === "Escape") setConfirmOpen(false);
        return;
      }
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
  }, [qIndex, quiz.questions, selectAnswer, confirmOpen]);

  const toggleSave = useCallback(
    async qid => {
      if (!isPaidUser) {
        toast("Save Questions is a Pro feature. Buy any Paper Plan to unlock!", "error");
        if (onRequirePlan) onRequirePlan();
        return;
      }
      const isSaved = Boolean(savedIds[qid]);
      setSavedIds(prev => ({ ...prev, [qid]: !isSaved }));
      try {
        await api(`/api/bookmarks/${encodeURIComponent(qid)}`, {
          method: isSaved ? "DELETE" : "POST",
          body: "{}"
        });
        toast(isSaved ? "Removed from Saved." : "Saved for revision ⭐", "success");
      } catch (e) {
        setSavedIds(prev => ({ ...prev, [qid]: isSaved }));
        toast(e.message, "error");
      }
    },
    [isPaidUser, savedIds, toast, onRequirePlan]
  );

  const reportQuestion = useCallback(
    async qid => {
      if (reporting) return;
      setReporting(true);
      try {
        await api(`/api/questions/${encodeURIComponent(qid)}/report`, {
          method: "POST",
          body: "{}"
        });
        toast("Question reported to admin. Thank you!", "success");
      } catch (e) {
        toast(e.message, "error");
      } finally {
        setReporting(false);
      }
    },
    [reporting, toast]
  );

  const q = quiz.questions[qIndex];
  const chosen = answers[q.id] || "";
  const answeredCount = Object.keys(answers).length;
  const initialSeconds = Number(quiz.paper.durationMinutes || 15) * 60;

  return (
    <div className="quiz-shell fade-in">
      <div className="quiz-head">
        <div>
          <b>{quiz.paper.title}</b>
          <div className="muted-sm">
            Question {qIndex + 1} of {quiz.questions.length} · {answeredCount} answered
          </div>
        </div>
        <QuizTimer initialSeconds={initialSeconds} onExpire={handleTimeExpire} paused={submitting} />
      </div>

      <div className="quiz-layout">
        <section className="q-card">
          <div className="q-top">
            <span className="pill">{q.topic || "General"}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-outline btn-sm" onClick={() => toggleSave(q.id)}>
                {!isPaidUser ? "🔒 Save" : savedIds[q.id] ? "⭐ Saved" : "☆ Save"}
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={reporting}
                onClick={() => reportQuestion(q.id)}
              >
                {reporting ? "…" : "🚩 Report"}
              </button>
            </div>
          </div>
          <div className="q-text">{q.question_text}</div>
          <div className="opt-list">
            {["A", "B", "C", "D"].map(k => (
              <button
                key={k}
                type="button"
                className={`opt-btn ${chosen === k ? "selected" : ""}`}
                onClick={() => selectAnswer(q.id, k)}
              >
                <span className="opt-key">{k}</span>
                <span>{q[`option_${k.toLowerCase()}`]}</span>
              </button>
            ))}
          </div>
          <div className="q-nav">
            <button
              className="btn btn-outline"
              disabled={qIndex === 0}
              onClick={() => setQIndex(i => i - 1)}
            >
              ← Previous
            </button>
            {qIndex < quiz.questions.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setQIndex(i => i + 1)}>
                Next →
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
              >
                {submitting ? (
                  <>
                    <span className="spinner" /> Submitting…
                  </>
                ) : (
                  "Submit Test ✓"
                )}
              </button>
            )}
          </div>
        </section>

        <aside className="palette-card">
          <b>Question Palette</b>
          <div className="palette-grid">
            {quiz.questions.map((item, idx) => (
              <PaletteDot
                key={item.id}
                idx={idx}
                answered={Boolean(answers[item.id])}
                current={idx === qIndex}
                onJump={setQIndex}
              />
            ))}
          </div>
          <button
            className="btn btn-primary full"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
          >
            {submitting ? (
              <>
                <span className="spinner" /> Grading…
              </>
            ) : (
              `Finish & Submit (${answeredCount}/${quiz.questions.length})`
            )}
          </button>
        </aside>
      </div>

      {confirmOpen && (
        <div
          className="modal-backdrop"
          onClick={e => !submitting && e.target === e.currentTarget && setConfirmOpen(false)}
        >
          <section className="modal-card" style={{ width: "min(400px, 100%)" }}>
            <span className="eyebrow">CONFIRM SUBMISSION</span>
            <h2 style={{ fontSize: 20 }}>Submit Mock Test?</h2>
            <p className="muted-sm" style={{ marginTop: 0 }}>
              You have answered <b>{answeredCount}</b> out of <b>{quiz.questions.length}</b>{" "}
              questions.
              {answeredCount < quiz.questions.length &&
                ` (${quiz.questions.length - answeredCount} unanswered)`}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                className="btn btn-outline full"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
              >
                Continue Test
              </button>
              <button
                className="btn btn-primary full"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
              >
                {submitting ? <span className="spinner" /> : "Yes, Submit ✓"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
