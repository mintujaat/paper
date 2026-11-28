import React, { memo } from "react";
import { Icon } from "./Icons.jsx";

const AttemptsView = memo(function AttemptsView({
  user,
  attempts,
  bestAccuracy,
  avgAccuracy,
  paperTitleMap,
  onOpenAuth
}) {
  if (!user) {
    return (
      <section className="fade-in">
        <div className="empty-panel">
          <div className="empty-icon">
            <Icon.Scores />
          </div>
          <h2>Sign in to view your scores</h2>
          <p className="muted-sm">
            Track all your mock test attempts, accuracy, and progress over time.
          </p>
          <button className="btn btn-primary" onClick={onOpenAuth}>
            Sign In / Create Account →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="fade-in">
      <div className="stack">
        <div className="section-head" style={{ marginBottom: 4 }}>
          <div>
            <span className="eyebrow">PERFORMANCE</span>
            <h1>My Mock Test Scores</h1>
          </div>
        </div>
        <div
          className="kpi-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
        >
          <div className="kpi">
            <span>Tests Completed</span>
            <b>{attempts.length}</b>
            <small>Submitted attempts</small>
          </div>
          <div className="kpi">
            <span>Best Accuracy</span>
            <b>{bestAccuracy}%</b>
            <small>Personal record</small>
          </div>
          <div className="kpi">
            <span>Average Accuracy</span>
            <b>{avgAccuracy}%</b>
            <small>Across all papers</small>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exam Paper</th>
                <th>Score</th>
                <th>Accuracy</th>
                <th>Mode</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map(a => (
                <tr key={a.id}>
                  <td>
                    <b>{paperTitleMap[a.paper_id] || a.paper_id}</b>
                  </td>
                  <td>
                    <b>
                      {a.score}/{a.total_questions}
                    </b>
                  </td>
                  <td>
                    <span className={`pill ${Number(a.accuracy_percent) >= 60 ? "good" : ""}`}>
                      {a.accuracy_percent}%
                    </span>
                  </td>
                  <td>
                    <span className="pill">{a.is_free ? "Free" : "Credit"}</span>
                  </td>
                  <td className="muted-sm">
                    {new Date(a.submitted_at || a.started_at).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
              {!attempts.length && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    You haven&apos;t completed any mock test yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
});

export default AttemptsView;
