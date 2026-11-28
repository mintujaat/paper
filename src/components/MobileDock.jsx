import React, { memo } from "react";
import { Icon } from "./Icons.jsx";

const DOCK_ITEMS = [
  { id: "tests", label: "Tests", Icon: Icon.Tests },
  { id: "plans", label: "Plans", Icon: Icon.Plans },
  { id: "leaderboard", label: "Ranks", Icon: Icon.Trophy },
  { id: "saved", label: "Saved", Icon: Icon.Bookmark },
  { id: "profile", label: "Profile", Icon: Icon.User }
];

const MobileDock = memo(function MobileDock({ tab, result, onNavigate }) {
  return (
    <nav className="mobile-dock" aria-label="Mobile Navigation">
      {DOCK_ITEMS.map(({ id, label, Icon: DockIcon }) => (
        <button
          key={id}
          className={tab === id && !result ? "active" : ""}
          onClick={() => onNavigate(id)}
        >
          <DockIcon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
});

export default MobileDock;
