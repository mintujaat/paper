import React, { memo } from "react";
import { Icon } from "./Icons.jsx";

const PlansView = memo(function PlansView({ plans, user, onBuyClick, onRequireAuth }) {
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <span className="eyebrow">TRANSPARENT PRICING</span>
          <h1>Choose Your Mock Test Pack</h1>
          <p className="muted-sm">
            Buy credits once — unlock <b>Saved Questions</b>, non-repeating random papers &amp;
            lifetime valid credits.
          </p>
        </div>
      </div>
      <div className="plans-grid">
        {plans.map(plan => {
          const per = (plan.priceInr / Math.max(1, plan.papersCount)).toFixed(0);
          const pop = plan.papersCount === 5 || /popular|best/i.test(plan.badge);
          return (
            <article key={plan.id} className={`plan-card ${pop ? "featured" : ""}`}>
              <div className="plan-card-head">
                <h3>{plan.title}</h3>
                {plan.badge && <span className={`plan-badge ${pop ? "hot" : ""}`}>{plan.badge}</span>}
              </div>
              <div className="plan-price">
                <b>₹{plan.priceInr}</b>
                <span>
                  / {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"}
                </span>
              </div>
              <div className="plan-unit">Only ₹{per} per mock test</div>
              <ul className="plan-perks">
                <li>
                  <Icon.Check /> {plan.papersCount} Mock Test{" "}
                  {plan.papersCount === 1 ? "Credit" : "Credits"}
                </li>
                <li>
                  <Icon.Check /> 25 fresh non-repeating questions
                </li>
                <li>
                  <Icon.Check /> Unlocks Saved Questions bank
                </li>
                <li>
                  <Icon.Check /> Credits never expire
                </li>
              </ul>
              <button
                className={`btn ${pop ? "btn-primary" : "btn-outline"} full`}
                onClick={() => (user ? onBuyClick() : onRequireAuth())}
              >
                Get {plan.papersCount} {plan.papersCount === 1 ? "Paper" : "Papers"} →
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
});

export default PlansView;
