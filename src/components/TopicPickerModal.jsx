import React, { memo } from "react";

const TopicPickerModal = memo(function TopicPickerModal({ topicPicker, onClose, onSelectTopic }) {
  if (!topicPicker) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <section className="modal-card" style={{ width: "min(460px, 100%)" }}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <span className="eyebrow">CHOOSE YOUR FOCUS</span>
        <h2 style={{ fontSize: 20 }}>{topicPicker.paper.title}</h2>
        <p className="muted-sm" style={{ marginTop: 0 }}>
          Select whether you want mixed questions from all sections or a specific Class / Topic.
        </p>
        <div className="stack" style={{ gap: 8, marginTop: 4 }}>
          <button
            className="btn btn-primary full"
            onClick={() => onSelectTopic(topicPicker.paper.id, "all")}
          >
            All / Both Mixed (Full Paper) →
          </button>
          {topicPicker.topics.map(t => (
            <button
              key={t.name}
              className="btn btn-outline full"
              style={{ justifyContent: "space-between" }}
              onClick={() => onSelectTopic(topicPicker.paper.id, t.name)}
            >
              <span>{t.name}</span>
              <span className="pill">{t.count} Qs</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
});

export default TopicPickerModal;
