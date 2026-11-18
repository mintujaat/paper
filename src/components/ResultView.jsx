import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { playResultSound } from "../sound.js";

export default function ResultView({ result, siteName, isPaidUser, onRequirePlan, onBack, toast }) {
  const [saved, setSaved] = useState({});

  useEffect(() => {
    playResultSound(Number(result?.accuracy || 0));
  }, []);

  async function saveQ(qid) {
    if (!isPaidUser) {
      toast("Save Questions is a Pro feature. Buy any Paper Plan to unlock!", "error");
      if (onRequirePlan) onRequirePlan();
      return;
    }
    try {
      await api(`/api/bookmarks/${encodeURIComponent(qid)}`, { method: "POST", body: "{}" });
      setSaved(p => ({ ...p, [qid]: true }));
      toast("Saved for revision ⭐", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  const acc = Number(result.accuracy || 0);
  const badge = acc >= 80 ? "🔥 Outstanding!" : acc >= 50 ? "👏 Great Effort!" : "💪 Keep Practicing!";
  const shareText = `I scored ${result.score}/${result.total} (${result.accuracy}%) and ranked #${result.rank} on ${siteName}! Try your 1st free mock test: ${location.origin}`;

  return (
    <div className="fade-in">
      <section className={`result-hero ${acc >= 70 ? "celebrate" : ""}`}>
        <span className="hero-pill">{badge}</span>
        <h1>Your Score Card 🏆</h1>
        <div className="result-stats">
          <div><small>SCORE</small><b>{result.score} / {result.total}</b></div>
          <div><small>ACCURACY</small><b>{result.accuracy}%</b></div>
          <div><small>LIVE RANK</small><b>#{result.rank}</b></div>
        </div>
        <div className="result-actions">
          <a className="btn btn-white" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>Share Rank on WhatsApp</a>
          <button className="btn btn-glass" onClick={() => window.print()}>Print Score Card</button>
          <button className="btn btn-glass" onClick={onBack}>Back to All Tests</button>
        </div>
      </section>

      <h2 style={{ marginBottom: 14 }}>Detailed Answer Key &amp; Explanations</h2>
      <div className="stack">
        {result.review.map((item, i) => (
          <article key={item.id} className={`review-card ${item.isCorrect ? "ok" : "bad"}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div className="review-q">Q{i + 1}. {item.question_text}</div>
              <button className="btn btn-outline btn-sm" disabled={saved[item.id]} onClick={() => saveQ(item.id)}>
                {!isPaidUser ? "🔒 Save" : saved[item.id] ? "⭐ Saved" : "☆ Save"}
              </button>
            </div>
            <div className="review-ans">
              Your answer: <b>{item.chosen || "Skipped"}</b> · Correct: <b className="text-green">{item.correct_option} ({item[`option_${item.correct_option.toLowerCase()}`]})</b>
            </div>
            {item.explanation && <div className="explain">💡 {item.explanation}</div>}
          </article>
        ))}
      </div>
    </div>
  );
}
