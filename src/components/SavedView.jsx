import React, { memo } from "react";
import { Icon } from "./Icons.jsx";

const SavedView = memo(function SavedView({
  user,
  isPaidUser,
  minPlanPrice,
  bookmarks,
  onOpenAuth,
  onOpenPlans,
  onRemoveBookmark
}) {
  if (!user) {
    return (
      <section className="fade-in">
        <div className="empty-panel">
          <div className="empty-icon">
            <Icon.Bookmark />
          </div>
          <h2>Sign in to view Saved Questions</h2>
          <p className="muted-sm">
            Bookmark tricky questions during tests for quick revision before exams.
          </p>
          <button className="btn btn-primary" onClick={onOpenAuth}>
            Sign In →
          </button>
        </div>
      </section>
    );
  }

  if (!isPaidUser) {
    return (
      <section className="fade-in">
        <div className="empty-panel">
          <div className="empty-icon lock">
            <Icon.Lock />
          </div>
          <span className="eyebrow">PRO FEATURE</span>
          <h2>Saved Questions is for Paid Users</h2>
          <p className="muted-sm">
            Buy any Paper Pack (starting at ₹{minPlanPrice}) to unlock unlimited question
            bookmarking and your personal revision bank.
          </p>
          <button className="btn btn-primary" onClick={onOpenPlans}>
            Unlock with Paper Plan →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <span className="eyebrow">REVISION BANK</span>
          <h1>Saved Questions ({bookmarks.length})</h1>
        </div>
      </div>
      <div className="stack">
        {bookmarks.map((qItem, i) => (
          <article key={qItem.id} className="review-card ok">
            <div className="review-head">
              <span className="q-idx">Q{i + 1}</span>
              <div className="review-q">{qItem.question_text}</div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => onRemoveBookmark(qItem.id)}
              >
                Remove
              </button>
            </div>
            <div className="review-ans">
              Correct Answer:{" "}
              <b className="text-green">
                {qItem.correct_option} —{" "}
                {qItem[`option_${String(qItem.correct_option || "a").toLowerCase()}`]}
              </b>
            </div>
            {qItem.explanation && (
              <div className="explain">
                <b>Explanation:</b> {qItem.explanation}
              </div>
            )}
          </article>
        ))}
        {!bookmarks.length && (
          <div className="empty-panel">
            <div className="empty-icon">
              <Icon.Bookmark />
            </div>
            <h3>No saved questions yet</h3>
            <p className="muted-sm">
              Tap <b>☆ Save</b> during any test or result review to build your revision bank.
            </p>
          </div>
        )}
      </div>
    </section>
  );
});

export default SavedView;
