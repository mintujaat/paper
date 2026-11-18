import React, { useState } from "react";
import { api } from "../api.js";

export default function PlansModal({ plans, config, user, onClose, onPurchased, toast }) {
  const [busyId, setBusyId] = useState("");

  async function buyPlan(plan) {
    if (busyId) return;
    if (!config?.razorpayReady || !window.Razorpay) {
      toast("Online payments are being activated by admin. Please check back shortly.", "error");
      return;
    }
    setBusyId(plan.id);
    try {
      const ord = await api("/api/payments/create-order", { method: "POST", body: JSON.stringify({ planId: plan.id }) });
      const rzp = new window.Razorpay({
        key: ord.keyId,
        amount: ord.amount,
        currency: ord.currency,
        name: config?.siteName || "YaadPage",
        description: `${ord.planTitle} (${ord.papersCount} Mock Papers)`,
        order_id: ord.orderId,
        prefill: { name: user?.name || "", email: user?.email || "" },
        handler: async resp => {
          try {
            const ver = await api("/api/payments/verify", { method: "POST", body: JSON.stringify(resp) });
            toast(`+${ver.addedCredits || plan.papersCount} Paper Credits added!`, "success");
            await onPurchased();
          } catch (e) { toast(e.message, "error"); }
        }
      });
      rzp.open();
    } catch (e) {
      toast(e.message, "error");
    } finally { setBusyId(""); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal-card modal-compact-plans">
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-plan-head">
          <span className="eyebrow" style={{ marginBottom: 2 }}>PAPER PACKS</span>
          <h2>Unlock Mock Papers</h2>
          <p className="muted-sm">Includes <b>Saved Questions ⭐</b> &amp; lifetime valid credits.</p>
        </div>

        <div className="modal-plans-grid">
          {plans.map(plan => {
            const perPaper = (plan.priceInr / Math.max(1, plan.papersCount)).toFixed(0);
            const isPopular = plan.papersCount === 5 || /popular|best/i.test(plan.badge);
            return (
              <article key={plan.id} className={`m-plan-card ${isPopular ? "featured" : ""}`}>
                <div className="m-plan-info">
                  <div className="m-plan-top">
                    <h3>{plan.title}</h3>
                    {plan.badge && <span className={`plan-badge ${isPopular ? "hot" : ""}`}>{plan.badge}</span>}
                  </div>
                  <div className="m-plan-meta">
                    <span>{plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"}</span>
                    <span>·</span>
                    <span className="m-per">₹{perPaper}/paper</span>
                  </div>
                </div>
                <div className="m-plan-buy">
                  <b className="m-price">₹{plan.priceInr}</b>
                  <button
                    className={`btn btn-sm ${isPopular ? "btn-primary" : "btn-outline"}`}
                    disabled={Boolean(busyId)}
                    onClick={() => buyPlan(plan)}
                  >
                    {busyId === plan.id ? <span className="spinner" /> : "Buy →"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
