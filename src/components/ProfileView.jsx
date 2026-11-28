import React, { memo } from "react";
import { Icon } from "./Icons.jsx";
import { getInitials, STATES_IN } from "../utils/cache.js";

const ProfileView = memo(function ProfileView({
  user,
  isPaidUser,
  credits,
  attemptsCount,
  avgAccuracy,
  savingProfile,
  onSaveProfile,
  onLogout,
  onOpenAuth,
  onOpenPlans,
  onNavigate
}) {
  if (!user) {
    return (
      <section className="fade-in">
        <div className="empty-panel">
          <div className="empty-icon">
            <Icon.User />
          </div>
          <h2>Sign in to manage your Profile</h2>
          <p className="muted-sm">
            Set your State &amp; District, check Paper Credits, and manage your account.
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
        <div className="profile-banner">
          <div className="profile-identity">
            <div className="avatar-lg">{getInitials(user.name)}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2>{user.name}</h2>
                <span className={`pill ${isPaidUser ? "good" : ""}`}>
                  {isPaidUser ? "PRO MEMBER" : "FREE ACCOUNT"}
                </span>
              </div>
              <p className="muted-sm">
                {user.email}
                {user.city || user.state
                  ? ` · ${[user.city, user.state].filter(Boolean).join(", ")}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="profile-quick-actions">
            <button className="btn btn-outline btn-sm" onClick={() => onNavigate("attempts")}>
              My Scores ({attemptsCount})
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => onNavigate("suggest")}>
              Suggest Paper
            </button>
            <button className="btn btn-primary btn-sm" onClick={onOpenPlans}>
              Buy Credits
            </button>
          </div>
        </div>

        <div className="grid-2">
          <div className="panel">
            <span className="eyebrow">PERSONAL DETAILS</span>
            <h3 style={{ marginBottom: 14, fontSize: 18 }}>Profile &amp; Location</h3>
            <form className="stack" onSubmit={onSaveProfile}>
              <label className="field">
                <span>Full Name</span>
                <input className="ctrl" name="name" defaultValue={user.name} required />
              </label>
              <label className="field">
                <span>Email Address</span>
                <input className="ctrl" value={user.email} disabled />
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>State</span>
                  <select className="ctrl" name="state" defaultValue={user.state || ""}>
                    <option value="">Select State</option>
                    {STATES_IN.map(st => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>District / City</span>
                  <input
                    className="ctrl"
                    name="city"
                    defaultValue={user.city || ""}
                    placeholder="e.g. Bhiwani, Hisar"
                  />
                </label>
              </div>
              <button className="btn btn-primary" type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save Changes"}
              </button>
            </form>
          </div>

          <div
            className="panel"
            style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16 }}
          >
            <div>
              <span className="eyebrow">ACCOUNT OVERVIEW</span>
              <h3 style={{ marginBottom: 14, fontSize: 18 }}>Credits &amp; Performance</h3>
              <div className="kpi-grid">
                <div className="kpi">
                  <span>Paper Credits</span>
                  <b>{credits}</b>
                  <small>Available tests</small>
                </div>
                <div className="kpi">
                  <span>Tests Taken</span>
                  <b>{attemptsCount}</b>
                  <small>Avg {avgAccuracy}% accuracy</small>
                </div>
              </div>
            </div>
            <div className="stack">
              <button className="btn btn-primary full" onClick={onOpenPlans}>
                Buy More Paper Credits →
              </button>
              <button
                className="btn btn-outline full"
                style={{ color: "var(--red)" }}
                onClick={onLogout}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export default ProfileView;
