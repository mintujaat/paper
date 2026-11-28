import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { api, apiCached, getDeviceMeta, invalidateApiCache, markFreeUsed } from "./api.js";
import { isSoundEnabled, setSoundEnabled } from "./sound.js";
import { useToast } from "./hooks/useToast.js";
import { useTheme } from "./hooks/useTheme.js";
import { readSwrCache, writeSwrCache } from "./utils/cache.js";

import Topbar from "./components/Topbar.jsx";
import MobileDock from "./components/MobileDock.jsx";
import TestsView from "./components/TestsView.jsx";
import PlansView from "./components/PlansView.jsx";
import LeaderboardView from "./components/LeaderboardView.jsx";
import SavedView from "./components/SavedView.jsx";
import AttemptsView from "./components/AttemptsView.jsx";
import ProfileView from "./components/ProfileView.jsx";
import SuggestView from "./components/SuggestView.jsx";
import TopicPickerModal from "./components/TopicPickerModal.jsx";

const AuthModal = lazy(() => import("./components/AuthModal.jsx"));
const PlansModal = lazy(() => import("./components/PlansModal.jsx"));
const QuizRunner = lazy(() => import("./components/QuizRunner.jsx"));
const ResultView = lazy(() => import("./components/ResultView.jsx"));
const AdminPanel = lazy(() => import("./components/AdminPanel.jsx"));

function ViewFallback() {
  return (
    <div className="boot" style={{ minHeight: "50dvh" }}>
      <span className="spinner dark" />
    </div>
  );
}

export default function App() {
  const initialCache = useMemo(() => readSwrCache(), []);
  const [isAdmin, setIsAdmin] = useState(() => location.pathname.startsWith("/admin"));
  const [loading, setLoading] = useState(() => !initialCache?.papers?.length);
  const [config, setConfig] = useState(() => initialCache?.config || null);
  const [user, setUser] = useState(() => initialCache?.user || null);
  const [papers, setPapers] = useState(() => initialCache?.papers || []);
  const [plans, setPlans] = useState(() => initialCache?.plans || []);
  const [attempts, setAttempts] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbPaperId, setLbPaperId] = useState(() => initialCache?.papers?.[0]?.id || "");
  const [tab, setTab] = useState("tests");
  const [cat, setCat] = useState("all");
  const [paperSearch, setPaperSearch] = useState("");
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [authModal, setAuthModal] = useState(null);
  const [showPlans, setShowPlans] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [result, setResult] = useState(null);
  const [startingPaperId, setStartingPaperId] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [topicPicker, setTopicPicker] = useState(null);
  const [sendingSuggest, setSendingSuggest] = useState(false);

  const { toastState, toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const toggleSound = useCallback(() => {
    setSoundOn(prev => {
      const next = !prev;
      setSoundEnabled(next);
      toast(next ? "Result sound enabled" : "Sound muted");
      return next;
    });
  }, [toast]);

  const refreshData = useCallback(async () => {
    const dm = getDeviceMeta();
    const [cfgRes, papersRes, plansRes, meRes] = await Promise.allSettled([
      api(`/api/public/config?deviceId=${encodeURIComponent(dm.deviceId)}&deviceFp=${encodeURIComponent(dm.deviceFp)}`),
      api("/api/papers"),
      api("/api/plans"),
      api("/api/auth/me")
    ]);

    const nextCfg = cfgRes.status === "fulfilled" ? cfgRes.value : null;
    const nextPapers = papersRes.status === "fulfilled" ? papersRes.value.papers || [] : null;
    const nextPlans = plansRes.status === "fulfilled" ? plansRes.value.plans || [] : null;
    const nextUser = meRes.status === "fulfilled" ? (meRes.value.authenticated ? meRes.value.user : null) : undefined;

    if (nextCfg) setConfig(nextCfg);
    if (nextPapers) {
      setPapers(nextPapers);
      setLbPaperId(prev => prev || nextPapers[0]?.id || "");
    }
    if (nextPlans) setPlans(nextPlans);
    if (nextUser !== undefined) setUser(nextUser);

    writeSwrCache({
      config: nextCfg || config,
      papers: nextPapers || papers,
      plans: nextPlans || plans,
      user: nextUser !== undefined ? nextUser : user
    });

    const activeUser = nextUser !== undefined ? nextUser : user;
    if (activeUser) {
      const jobs = [api("/api/attempts")];
      if (activeUser.isPaidUser) jobs.push(api("/api/bookmarks"));
      Promise.allSettled(jobs).then(([attR, bmR]) => {
        if (attR?.status === "fulfilled") setAttempts(attR.value.attempts || []);
        if (bmR?.status === "fulfilled") setBookmarks(bmR.value.bookmarks || []);
      });
    } else {
      setAttempts([]);
      setBookmarks([]);
    }
  }, []);

  useEffect(() => {
    refreshData().finally(() => setLoading(false));
    try {
      if (!sessionStorage.getItem("quiz_visited")) {
        sessionStorage.setItem("quiz_visited", "1");
        fetch("/api/public/visit", { method: "POST" }).catch(() => {});
      }
    } catch {}
    const onPop = () => setIsAdmin(location.pathname.startsWith("/admin"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [refreshData]);

  useEffect(() => {
    if (tab === "leaderboard" && lbPaperId) {
      setLbLoading(true);
      apiCached(`/api/papers/${encodeURIComponent(lbPaperId)}/leaderboard`, 25000)
        .then(r => setLeaderboard(r.leaderboard || []))
        .catch(() => {})
        .finally(() => setLbLoading(false));
    }
    if (tab === "saved" && user?.isPaidUser) {
      api("/api/bookmarks")
        .then(r => setBookmarks(r.bookmarks || []))
        .catch(() => {});
    }
  }, [tab, lbPaperId, user?.isPaidUser]);

  const navigate = useCallback((nextTab, clearQuiz = false) => {
    setResult(null);
    if (clearQuiz) setActiveQuiz(null);
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const startPaper = useCallback(
    async (paperId, topicFilter = null) => {
      if (!user) {
        setAuthModal({ mode: "login", after: () => startPaper(paperId, topicFilter) });
        return;
      }
      if (!config?.freeEligible && Number(user?.paperCredits || 0) <= 0) {
        setShowPlans(true);
        return;
      }
      if (startingPaperId) return;
      setStartingPaperId(paperId);
      try {
        if (topicFilter === null) {
          try {
            const tRes = await apiCached(`/api/papers/${encodeURIComponent(paperId)}/topics`, 60000);
            const topics = tRes?.topics || [];
            if (topics.length >= 2) {
              const paperObj = papers.find(x => x.id === paperId) || { id: paperId, title: "Mock Test" };
              setTopicPicker({ paper: paperObj, topics });
              setStartingPaperId("");
              return;
            }
          } catch {}
        }
        setTopicPicker(null);
        const dm = getDeviceMeta();
        const res = await api("/api/attempts/start", {
          method: "POST",
          body: JSON.stringify({ paperId, topicFilter: topicFilter || "all", ...dm })
        });
        if (res.isFree) markFreeUsed();
        setResult(null);
        setActiveQuiz(res);
        window.scrollTo({ top: 0, behavior: "smooth" });
        refreshData();
      } catch (err) {
        if (err.status === 402 && err.data?.requiresPlan) {
          setShowPlans(true);
        } else {
          toast(err.message, "error");
        }
      } finally {
        setStartingPaperId("");
      }
    },
    [user, config?.freeEligible, startingPaperId, papers, refreshData, toast]
  );

  const submitSuggestion = useCallback(
    async e => {
      e.preventDefault();
      if (sendingSuggest) return;
      setSendingSuggest(true);
      const form = e.currentTarget;
      const fd = Object.fromEntries(new FormData(form).entries());
      try {
        await api("/api/suggestions", { method: "POST", body: JSON.stringify(fd) });
        form.reset();
        toast("Thank you! Your suggestion has been sent to Admin.", "success");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setSendingSuggest(false);
      }
    },
    [sendingSuggest, toast]
  );

  const saveProfile = useCallback(
    async e => {
      e.preventDefault();
      if (savingProfile) return;
      setSavingProfile(true);
      const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
      try {
        await api("/api/profile", { method: "PATCH", body: JSON.stringify(fd) });
        await refreshData();
        toast("Profile updated successfully!", "success");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setSavingProfile(false);
      }
    },
    [savingProfile, refreshData, toast]
  );

  const handleLogout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    setAttempts([]);
    setBookmarks([]);
    setTab("tests");
    toast("Logged out.");
  }, [toast]);

  const handleRemoveBookmark = useCallback(
    async id => {
      setBookmarks(b => b.filter(x => x.id !== id));
      try {
        await api(`/api/bookmarks/${encodeURIComponent(id)}`, { method: "DELETE" });
        toast("Removed from saved.");
      } catch (err) {
        toast(err.message, "error");
      }
    },
    [toast]
  );

  const siteName = config?.siteName || "YaadPage";
  const freeOk = Boolean(config?.freeEligible);
  const credits = Number(user?.paperCredits || 0);
  const isPaidUser = Boolean(user?.isPaidUser);

  const paperTitleMap = useMemo(
    () => Object.fromEntries(papers.map(p => [p.id, p.title])),
    [papers]
  );

  const minPlanPrice = useMemo(
    () => (plans.length ? Math.min(...plans.map(x => Number(x.priceInr || 25))) : 25),
    [plans]
  );

  const { avgAccuracy, bestAccuracy } = useMemo(() => {
    if (!attempts.length) return { avgAccuracy: 0, bestAccuracy: 0 };
    let sum = 0;
    let best = 0;
    for (const a of attempts) {
      const val = Number(a.accuracy_percent || 0);
      sum += val;
      if (val > best) best = val;
    }
    return { avgAccuracy: Math.round(sum / attempts.length), bestAccuracy: best };
  }, [attempts]);

  if (isAdmin) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <AdminPanel
          toast={toast}
          onExit={() => {
            history.pushState({}, "", "/");
            setIsAdmin(false);
            invalidateApiCache();
            refreshData();
          }}
        />
        <div className={`toast ${toastState.show ? "show" : ""} ${toastState.kind}`}>
          {toastState.msg}
        </div>
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div className="boot">
        <span className="logo-mark">Y</span>
        <span className="spinner dark" />
        <p>Loading YaadPage…</p>
      </div>
    );
  }

  return (
    <div className="app-root">
      <Topbar
        siteName={siteName}
        activeQuiz={activeQuiz}
        result={result}
        tab={tab}
        onNavigate={navigate}
        user={user}
        credits={credits}
        isPaidUser={isPaidUser}
        soundOn={soundOn}
        theme={theme}
        onToggleSound={toggleSound}
        onToggleTheme={toggleTheme}
        onOpenPlans={() => setShowPlans(true)}
        onOpenAuth={() => setAuthModal({ mode: "login" })}
      />

      <main className="container">
        {config?.announcement?.enabled && config?.announcement?.text && (
          <div className="notice-banner">
            <span className="notice-dot" />
            <span>{config.announcement.text}</span>
          </div>
        )}

        <Suspense fallback={<ViewFallback />}>
          {activeQuiz ? (
            <QuizRunner
              quiz={activeQuiz}
              isPaidUser={isPaidUser}
              onRequirePlan={() => setShowPlans(true)}
              toast={toast}
              onSubmitted={res => {
                setActiveQuiz(null);
                setResult(res);
                invalidateApiCache("/api/papers/");
                refreshData();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : result ? (
            <ResultView
              result={result}
              siteName={siteName}
              isPaidUser={isPaidUser}
              onRequirePlan={() => setShowPlans(true)}
              toast={toast}
              onBack={() => navigate("tests")}
            />
          ) : tab === "plans" ? (
            <PlansView
              plans={plans}
              user={user}
              onBuyClick={() => setShowPlans(true)}
              onRequireAuth={() => setAuthModal({ mode: "login", after: () => setShowPlans(true) })}
            />
          ) : tab === "leaderboard" ? (
            <LeaderboardView
              papers={papers}
              lbPaperId={lbPaperId}
              setLbPaperId={setLbPaperId}
              leaderboard={leaderboard}
              loading={lbLoading}
            />
          ) : tab === "saved" ? (
            <SavedView
              user={user}
              isPaidUser={isPaidUser}
              minPlanPrice={minPlanPrice}
              bookmarks={bookmarks}
              onOpenAuth={() => setAuthModal({ mode: "login" })}
              onOpenPlans={() => setShowPlans(true)}
              onRemoveBookmark={handleRemoveBookmark}
            />
          ) : tab === "profile" ? (
            <ProfileView
              user={user}
              isPaidUser={isPaidUser}
              credits={credits}
              attemptsCount={attempts.length}
              avgAccuracy={avgAccuracy}
              savingProfile={savingProfile}
              onSaveProfile={saveProfile}
              onLogout={handleLogout}
              onOpenAuth={() => setAuthModal({ mode: "login" })}
              onOpenPlans={() => setShowPlans(true)}
              onNavigate={navigate}
            />
          ) : tab === "suggest" ? (
            <SuggestView
              siteName={siteName}
              user={user}
              sendingSuggest={sendingSuggest}
              onSubmit={submitSuggestion}
            />
          ) : tab === "attempts" ? (
            <AttemptsView
              user={user}
              attempts={attempts}
              bestAccuracy={bestAccuracy}
              avgAccuracy={avgAccuracy}
              paperTitleMap={paperTitleMap}
              onOpenAuth={() => setAuthModal({ mode: "login" })}
            />
          ) : (
            <TestsView
              papers={papers}
              cat={cat}
              setCat={setCat}
              paperSearch={paperSearch}
              setPaperSearch={setPaperSearch}
              freeOk={freeOk}
              credits={credits}
              minPlanPrice={minPlanPrice}
              user={user}
              attemptsCount={attempts.length}
              bestAccuracy={bestAccuracy}
              isPaidUser={isPaidUser}
              startingPaperId={startingPaperId}
              onStartPaper={startPaper}
              onOpenPlans={() => setShowPlans(true)}
              onNavigate={navigate}
            />
          )}
        </Suspense>
      </main>

      {!activeQuiz && <MobileDock tab={tab} result={result} onNavigate={navigate} />}

      <TopicPickerModal
        topicPicker={topicPicker}
        onClose={() => setTopicPicker(null)}
        onSelectTopic={startPaper}
      />

      <Suspense fallback={null}>
        {authModal && (
          <AuthModal
            config={config}
            initialMode={authModal.mode}
            toast={toast}
            onClose={() => setAuthModal(null)}
            onSuccess={async () => {
              const fn = authModal.after;
              setAuthModal(null);
              await refreshData();
              if (fn) fn();
            }}
          />
        )}
        {showPlans && (
          <PlansModal
            plans={plans}
            config={config}
            user={user}
            toast={toast}
            onClose={() => setShowPlans(false)}
            onPurchased={async () => {
              setShowPlans(false);
              await refreshData();
            }}
          />
        )}
      </Suspense>

      <div className={`toast ${toastState.show ? "show" : ""} ${toastState.kind}`}>
        {toastState.msg}
      </div>
    </div>
  );
}
