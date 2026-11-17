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
        name: config?.siteName || "Mintu Exam Hub",
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
      <section className="modal-card modal-wide">
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">CHOOSE A MOCK TEST PACK</span>
        <h2>Unlock More Mock Papers</h2>
        <p className="muted-sm">Credits work across any exam (HSSC, Police, SSC, Board) with fresh non-repeating questions.</p>

        <div className="plans-grid">
          {plans.map(plan => {
            const perPaper = (plan.priceInr / Math.max(1, plan.papersCount)).toFixed(0);
            const isPopular = plan.papersCount === 5 || /popular|best/i.test(plan.badge);
            return (
              <article key={plan.id} className={`plan-card ${isPopular ? "featured" : ""}`}>
                {plan.badge && <span className="plan-badge">{plan.badge}</span>}
                <h3>{plan.title}</h3>
                <div className="plan-price"><b>₹{plan.priceInr}</b><span>/ {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"}</span></div>
                <small className="plan-unit">Only ₹{perPaper} per mock test</small>
                <button className={`btn ${isPopular ? "btn-primary" : "btn-outline"} full`} disabled={Boolean(busyId)} onClick={() => buyPlan(plan)}>
                  {busyId === plan.id ? <><span className="spinner" /> Opening…</> : `Buy ${plan.papersCount} ${plan.papersCount === 1 ? "Paper" : "Papers"} →`}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
