import React, { memo } from "react";

const SuggestView = memo(function SuggestView({ siteName, user, sendingSuggest, onSubmit }) {
  return (
    <section className="fade-in" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="panel">
        <span className="eyebrow">STUDENT FEEDBACK</span>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>Suggest a Paper or Feature</h1>
        <p className="muted-sm" style={{ marginBottom: 16 }}>
          Want a new exam paper, class-specific questions, or a new feature on {siteName}? Send
          your suggestion directly to the Admin.
        </p>
        <form className="stack" onSubmit={onSubmit}>
          <div className="grid-2">
            <label className="field">
              <span>Your Name</span>
              <input
                className="ctrl"
                name="name"
                defaultValue={user?.name || ""}
                placeholder="Enter your name"
                required
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select className="ctrl" name="category" defaultValue="New Paper Request">
                <option>New Paper Request</option>
                <option>Class / Topic Filter</option>
                <option>Question Correction</option>
                <option>App / Feature Idea</option>
                <option>Other</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Email (optional)</span>
            <input
              className="ctrl"
              type="email"
              name="email"
              defaultValue={user?.email || ""}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            <span>Your Suggestion</span>
            <textarea
              className="ctrl"
              name="message"
              rows={4}
              style={{ padding: 12, minHeight: 110 }}
              required
              minLength={5}
              placeholder="e.g. Please add HSSC Patwari mock test or separate Class 10th Science questions…"
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={sendingSuggest}>
            {sendingSuggest ? "Sending…" : "Send Suggestion to Admin →"}
          </button>
        </form>
      </div>
    </section>
  );
});

export default SuggestView;
