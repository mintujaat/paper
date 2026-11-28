import React, { memo } from "react";
import { getInitials } from "../utils/cache.js";

const LeaderboardView = memo(function LeaderboardView({
  papers,
  lbPaperId,
  setLbPaperId,
  leaderboard,
  loading
}) {
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <span className="eyebrow">RANKINGS</span>
          <h1>Top Performers</h1>
          <p className="muted-sm">
            Ranked by highest score, accuracy, and fastest completion time.
          </p>
        </div>
        <select
          className="ctrl"
          style={{ maxWidth: 280 }}
          value={lbPaperId}
          onChange={e => setLbPaperId(e.target.value)}
        >
          {papers.map(p => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {loading && !leaderboard.length ? (
        <div className="podium-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      ) : (
        <>
          {leaderboard.length > 0 && (
            <div className="podium-grid">
              {leaderboard.slice(0, 3).map((r, i) => (
                <article key={i} className={`podium-card rank-${i + 1}`}>
                  <div className="podium-rank">#{i + 1}</div>
                  <div className="avatar-md">{getInitials(r.user_name)}</div>
                  <h3>{r.user_name}</h3>
                  <small>{r.user_city || "India"}</small>
                  <div className="podium-metrics">
                    <div>
                      <span>SCORE</span>
                      <b>
                        {r.score}/{r.total_questions}
                      </b>
                    </div>
                    <div>
                      <span>ACCURACY</span>
                      <b>{r.accuracy_percent}%</b>
                    </div>
                    <div>
                      <span>TIME</span>
                      <b>
                        {Math.floor((r.time_taken_sec || 0) / 60)}m {(r.time_taken_sec || 0) % 60}s
                      </b>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>City</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`rank-pill rank-${i < 3 ? i + 1 : "n"}`}>#{i + 1}</span>
                    </td>
                    <td>
                      <b>{r.user_name}</b>
                    </td>
                    <td>{r.user_city || "—"}</td>
                    <td>
                      <b>
                        {r.score}/{r.total_questions}
                      </b>
                    </td>
                    <td>
                      <span className="pill good">{r.accuracy_percent}%</span>
                    </td>
                    <td>
                      {Math.floor((r.time_taken_sec || 0) / 60)}m {(r.time_taken_sec || 0) % 60}s
                    </td>
                  </tr>
                ))}
                {!leaderboard.length && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No completed attempts for this paper yet. Be the first!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
});

export default LeaderboardView;
