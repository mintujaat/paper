import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

export default function AuthModal({ config, initialMode = "login", onClose, onSuccess, toast }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gErr, setGErr] = useState("");
  const gRef = useRef(null);

  useEffect(() => {
    if (!config?.googleClientId) return;
    let alive = true;
    const mount = (tries = 0) => {
      if (!alive || !gRef.current) return;
      if (!window.google?.accounts?.id) {
        if (tries < 25) return setTimeout(() => mount(tries + 1), 200);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: async resp => {
          setGErr("");
          try {
            await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: resp.credential }) });
            toast("Signed in with Google!", "success");
            await onSuccess();
          } catch (e) { setGErr(e.message); }
        }
      });
      window.google.accounts.id.renderButton(gRef.current, { theme: "outline", size: "large", width: Math.min(340, Math.max(240, window.innerWidth - 84)) });
    };
    mount(0);
    return () => { alive = false; };
  }, [config?.googleClientId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      await api(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body: JSON.stringify(fd) });
      toast(mode === "signup" ? "Account created!" : "Welcome back!", "success");
      await onSuccess();
    } catch (e2) {
      setErr(e2.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal-card">
        <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">{mode === "signup" ? "GET STARTED FREE" : "STUDENT PORTAL"}</span>
        <h2>{mode === "signup" ? "Create your free account" : "Welcome back"}</h2>
        <p className="muted-sm">{mode === "signup" ? "Your 1st mock paper is free. Track scores & All-India ranks." : "Sign in to access your credits, scores and mock tests."}</p>

        {config?.googleClientId && (
          <>
            <div className="g-wrap" ref={gRef}></div>
            {gErr && <div className="err">{gErr}</div>}
            <div className="divider"><span>or continue with email</span></div>
          </>
        )}

        <form onSubmit={handleSubmit} className="stack">
          {mode === "signup" && (
            <>
              <input className="ctrl" name="name" required placeholder="Full Name" />
              <input className="ctrl" name="city" placeholder="City / District (e.g. Bhiwani)" />
            </>
          )}
          <input className="ctrl" name="email" type="email" required placeholder="Email Address" />
          <input className="ctrl" name="password" type="password" minLength={6} required placeholder="Password (6+ characters)" />
          {err && <div className="err">{err}</div>}
          <button className="btn btn-primary btn-lg full" type="submit" disabled={busy}>
            {busy ? <><span className="spinner" /> Please wait…</> : mode === "signup" ? "Create Free Account →" : "Sign In →"}
          </button>
        </form>

        <button className="btn btn-ghost full" style={{ marginTop: 6 }} onClick={() => { setErr(""); setMode(mode === "signup" ? "login" : "signup"); }}>
          {mode === "signup" ? "Already have an account? Sign in" : "New student? Create free account"}
        </button>
      </section>
    </div>
  );
}
