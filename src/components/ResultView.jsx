import React from "react";

export default function ResultView({ result, siteName, onBack }) {
  const shareText = `I scored ${result.score}/${result.total} (${result.accuracy}%) and ranked #${result.rank} on ${siteName}! Try your 1st free mock test: ${location.origin}`;
  return (
    <div className="fade-in">
      <section className="result-hero">
        <span className="hero-pill">MOCK TEST COMPLETED</span>
        <h1>Your Score Card 🏆</h1>
        <div className="result-stats">
          <div><small>SCORE</small><b>{result.score} / {result.total}</b></div>
          <div><small>ACCURACY</small><b>{result.accuracy}%</b></div>
          <div><small>LIVE RANK</small><b>#{result.rank}</b></div>
        </div>
        <div className="result-actions">
          <a className="btn btn-white" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>Share Rank on WhatsApp</a>
          <button className="btn btn-glass" onClick={onBack}>Back to All Tests</button>
        </div>
      </section>

      <h2 style={{ marginBottom: 14 }}>Detailed Answer Key &amp; Explanations</h2>
      <div className="stack">
        {result.review.map((item, i) => (
          <article key={item.id} className={`review-card ${item.isCorrect ? "ok" : "bad"}`}>
            <div className="review-q">Q{i + 1}. {item.question_text}</div>
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
