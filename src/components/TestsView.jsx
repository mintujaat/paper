import React, { memo, useDeferredValue, useMemo } from "react";
import { Icon } from "./Icons.jsx";

const PaperCard = memo(function PaperCard({
  paper,
  freeOk,
  hasCreds,
  minPlanPrice,
  starting,
  onStart
}) {
  const statusBadge = freeOk ? "1st Free" : hasCreds ? "1 Credit" : `From ₹${minPlanPrice}`;
  const isAvailable = freeOk || hasCreds;

  return (
    <article className="paper-card compact-card">
      <div className="card-top">
        <div className="paper-title-group">
          <span className="paper-monogram">
            {(paper.category || paper.title || "Y").slice(0, 2).toUpperCase()}
          </span>
          <span className="pill">{paper.category}</span>
        </div>
        <span className={`pill ${isAvailable ? "good" : ""}`}>{statusBadge}</span>
      </div>

      <h3>{paper.title}</h3>
      {paper.description && <p className="paper-desc">{paper.description}</p>}

      <div className="meta-row">
        <span><Icon.Clock /> {paper.durationMinutes}m</span>
        <span><Icon.Help /> {paper.questionsPerAttempt} Qs</span>
        <span><Icon.Layers /> {paper.totalBankQuestions} Bank</span>
      </div>

      {paper.sponsorName && (
        <div className="sponsor-box">
          <span>
            Sponsored by <b>{paper.sponsorName}</b>
          </span>
          {paper.sponsorLink && (
            <a href={paper.sponsorLink} target="_blank" rel="noopener noreferrer">
              Visit →
            </a>
          )}
        </div>
      )}

      <button
        className={`btn ${isAvailable ? "btn-primary" : "btn-outline"} btn-sm full`}
        style={{ marginTop: "auto" }}
        disabled={paper.totalBankQuestions === 0 || starting}
        onClick={() => onStart(paper.id)}
      >
        {starting ? (
          <>
            <span className="spinner" /> Starting…
          </>
        ) : paper.totalBankQuestions === 0 ? (
          "Coming Soon"
        ) : freeOk ? (
          "Start Free Test →"
        ) : hasCreds ? (
          "Start Test (1 Credit) →"
        ) : (
          "Unlock Plan →"
        )}
      </button>
    </article>
  );
});

const TestsView = memo(function TestsView({
  papers,
  cat,
  setCat,
  paperSearch,
  setPaperSearch,
  freeOk,
  credits,
  minPlanPrice,
  user,
  attemptsCount,
  bestAccuracy,
  isPaidUser,
  startingPaperId,
  onStartPaper,
  onOpenPlans,
  onNavigate
}) {
  const deferredSearch = useDeferredValue(paperSearch);

  const cats = useMemo(
    () => ["all", ...new Set(papers.map(p => p.category || "Other"))],
    [papers]
  );

  const visiblePapers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return papers.filter(p => {
      const matchCat = cat === "all" || (p.category || "Other") === cat;
      const matchQ =
        !q || `${p.title} ${p.category} ${p.description || ""}`.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [papers, cat, deferredSearch]);

  const hasCreds = credits > 0;

  return (
    <div className="fade-in stack" style={{ gap: 20 }}>
      <section className="hero-surface compact-hero">
        <div className="hero-main">
          <span className="hero-badge">
            {freeOk ? "1ST MOCK TEST FREE" : hasCreds ? `${credits} CREDITS AVAILABLE` : "SMART EXAM PREP"}
          </span>
          <h1>Practice smarter for Govt &amp; Board Exams</h1>
          <p>
            Every test draws 25 non-repeating questions from our curated bank with a 15-minute live
            timer, instant rank, and step-by-step solutions.
          </p>
          <div className="hero-cta">
            <button
              className="btn btn-primary"
              onClick={() => papers[0] && onStartPaper(papers[0].id)}
            >
              {freeOk ? "Start Free Mock Test →" : "Start Mock Test →"}
            </button>
            <button className="btn btn-outline" onClick={() => onNavigate("plans")}>
              View Plans (From ₹{minPlanPrice})
            </button>
            <button className="btn btn-outline" onClick={() => onNavigate("suggest")}>
              Suggest Paper 💡
            </button>
          </div>
        </div>
        <div className="hero-highlights">
          <div className="hl-item">
            <b>1st Test Free</b>
            <span>Try any exam paper with zero payment</span>
          </div>
          <div className="hl-item">
            <b>25 Fresh Qs</b>
            <span>Non-repeating questions per attempt</span>
          </div>
          <div className="hl-item">
            <b>Live Leaderboard</b>
            <span>Compare score &amp; speed across India</span>
          </div>
          <div className="hl-item">
            <b>Revision Bank</b>
            <span>Save tricky questions for last-day prep</span>
          </div>
        </div>
      </section>

      {user && (
        <section className="dash-strip">
          <div className="dash-tile clickable" onClick={onOpenPlans}>
            <span>PAPER CREDITS</span>
            <b>{credits}</b>
            <small>Tap to add more →</small>
          </div>
          <div className="dash-tile clickable" onClick={() => onNavigate("attempts")}>
            <span>TESTS TAKEN</span>
            <b>{attemptsCount}</b>
            <small>View score history →</small>
          </div>
          <div className="dash-tile">
            <span>BEST ACCURACY</span>
            <b>{bestAccuracy}%</b>
            <small>Personal best</small>
          </div>
          <div className="dash-tile clickable" onClick={() => onNavigate("profile")}>
            <span>ACCOUNT TIER</span>
            <b>{isPaidUser ? "PRO" : "FREE"}</b>
            <small>{isPaidUser ? "Bookmarks unlocked" : "Upgrade with any pack"}</small>
          </div>
        </section>
      )}

      <section>
        <div className="section-head" style={{ marginBottom: 10 }}>
          <div>
            <span className="eyebrow">EXAM CATALOG</span>
            <h2 style={{ fontSize: 22 }}>Available Mock Tests ({visiblePapers.length})</h2>
          </div>
          <div className="search-wrap">
            <Icon.Search />
            <input
              className="search-input"
              type="search"
              placeholder="Search exam, subject, or category…"
              value={paperSearch}
              onChange={e => setPaperSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="cat-bar">
          {cats.map(c => (
            <button
              key={c}
              className={`cat-chip ${cat === c ? "active" : ""}`}
              onClick={() => setCat(c)}
            >
              {c === "all" ? "All Exams" : c}
            </button>
          ))}
        </div>

        <div className="papers-grid compact-grid">
          {visiblePapers.map(p => (
            <PaperCard
              key={p.id}
              paper={p}
              freeOk={freeOk}
              hasCreds={hasCreds}
              minPlanPrice={minPlanPrice}
              starting={startingPaperId === p.id}
              onStart={onStartPaper}
            />
          ))}
          {!visiblePapers.length && (
            <div className="empty-panel" style={{ gridColumn: "1 / -1" }}>
              <div className="empty-icon">
                <Icon.Search />
              </div>
              <h3>No matching exam papers</h3>
              <p className="muted-sm">
                Try clearing your search filter or switching to All Exams.
              </p>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setCat("all");
                  setPaperSearch("");
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
});

export default TestsView;
