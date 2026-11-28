import React, { memo } from "react";
import { Icon } from "./Icons.jsx";
import { getInitials } from "../utils/cache.js";

const NAV_ITEMS = [
  { id: "tests", label: "Mock Tests", Icon: Icon.Tests },
  { id: "plans", label: "Plans", Icon: Icon.Plans },
  { id: "leaderboard", label: "Leaderboard", Icon: Icon.Trophy },
  { id: "attempts", label: "My Scores", Icon: Icon.Scores },
  { id: "saved", label: "Saved", Icon: Icon.Bookmark },
  { id: "suggest", label: "Suggest", Icon: Icon.Suggest }
];

const Topbar = memo(function Topbar({
  siteName,
  activeQuiz,
  result,
  tab,
  onNavigate,
  user,
  credits,
  isPaidUser,
  soundOn,
  theme,
  onToggleSound,
  onToggleTheme,
  onOpenPlans,
  onOpenAuth
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a
          className="brand"
          href="/"
          onClick={e => {
            e.preventDefault();
            onNavigate("tests", true);
          }}
        >
          <span className="logo-mark">Y</span>
          <div>
            <b>{siteName}</b>
            <small>MOCK TEST PORTAL</small>
          </div>
        </a>

        {!activeQuiz && (
          <nav className="top-nav" aria-label="Primary">
            {NAV_ITEMS.map(({ id, label, Icon: NavIcon }) => (
              <button
                key={id}
                className={tab === id && !result ? "active" : ""}
                onClick={() => onNavigate(id)}
              >
                <NavIcon /> <span>{label}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="top-actions">
          {user && (
            <button className="credit-pill" onClick={onOpenPlans} title="Buy more paper credits">
              <Icon.Ticket />
              <b>{credits}</b>
              <span className="hide-xs">{credits === 1 ? "Credit" : "Credits"}</span>
              <span className="credit-plus">+</span>
            </button>
          )}
          <button
            className="icon-btn"
            onClick={onToggleSound}
            aria-label="Toggle sound"
            title={soundOn ? "Mute result sound" : "Enable result sound"}
          >
            {soundOn ? <Icon.VolumeOn /> : <Icon.VolumeOff />}
          </button>
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            title="Switch Light/Dark theme"
          >
            {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          {user ? (
            <button
              className={`user-chip ${tab === "profile" && !result ? "active" : ""}`}
              onClick={() => onNavigate("profile")}
              title="Open Profile"
            >
              <span className="avatar-xs">{getInitials(user.name)}</span>
              <span className="user-chip-name">{user.name.split(" ")[0]}</span>
              {isPaidUser && <span className="pro-tag">PRO</span>}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onOpenAuth}>
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
});

export default Topbar;
