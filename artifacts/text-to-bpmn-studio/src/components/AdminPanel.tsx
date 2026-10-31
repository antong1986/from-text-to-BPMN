import { useEffect, useState } from "react";
import { ArrowLeft, Crown, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";

type AdminLanguage = "en" | "ru";
type AdminStats = {
  totalUsers: number;
  activePremiumSubscriptions: number;
  totalGenerations: number;
};
type AdminUser = {
  id: number;
  email: string;
  isPremium: boolean;
  premiumUntil: string | null;
  isWhitelisted: boolean;
  freeGenerationsLeft: number;
};
type AuthResponse = {
  authenticated: boolean;
  user?: { email: string; isWhitelisted: boolean };
};

const copy = {
  en: {
    title: "Administration",
    subtitle: "Manage access and subscriptions",
    back: "Back to studio",
    language: "Рус",
    totalUsers: "Total users",
    activePremium: "Active premium subscriptions",
    totalGenerations: "Total AI generations",
    search: "Search by email",
    user: "User",
    premium: "Premium",
    whitelist: "Whitelist",
    freeLeft: "Free generations left",
    actions: "Actions",
    active: "Active",
    expired: "Expired",
    inactive: "Inactive",
    enabled: "Enabled",
    disabled: "Disabled",
    removeWhitelist: "Remove whitelist",
    addWhitelist: "Add whitelist",
    grantPremium: "Grant 30 days",
    extendPremium: "Extend 30 days",
    loading: "Checking administrator access…",
    loadingData: "Loading dashboard…",
    noUsers: "No users found.",
    loadError: "Could not load administration data.",
    retry: "Retry",
    signedInAs: "Signed in as",
    refreshing: "Refreshing…",
  },
  ru: {
    title: "Административная панель",
    subtitle: "Управление доступом и подписками",
    back: "Вернуться в студию",
    language: "Eng",
    totalUsers: "Всего пользователей",
    activePremium: "Активных Premium-подписок",
    totalGenerations: "Всего ИИ-генераций",
    search: "Поиск по email",
    user: "Пользователь",
    premium: "Premium",
    whitelist: "Whitelist",
    freeLeft: "Осталось бесплатных генераций",
    actions: "Действия",
    active: "Активна",
    expired: "Истекла",
    inactive: "Не активна",
    enabled: "Включён",
    disabled: "Выключен",
    removeWhitelist: "Убрать из whitelist",
    addWhitelist: "Добавить в whitelist",
    grantPremium: "Выдать 30 дней",
    extendPremium: "Продлить на 30 дней",
    loading: "Проверка прав администратора…",
    loadingData: "Загрузка панели…",
    noUsers: "Пользователи не найдены.",
    loadError: "Не удалось загрузить данные панели.",
    retry: "Повторить",
    signedInAs: "Вы вошли как",
    refreshing: "Обновление…",
  },
} satisfies Record<AdminLanguage, Record<string, string>>;

function getInitialLanguage(): AdminLanguage {
  try {
    return window.localStorage.getItem("text-to-bpmn-language") === "ru" ? "ru" : "en";
  } catch {
    return "en";
  }
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401 || response.status === 403) {
    window.location.replace("/");
    throw new Error("Administrator access required.");
  }

  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}

function formatDate(value: string | null, language: AdminLanguage): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
  }).format(date);
}

export default function AdminPanel() {
  const [language, setLanguage] = useState<AdminLanguage>(getInitialLanguage);
  const text = copy[language];
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState("");
  const [refreshStatsVersion, setRefreshStatsVersion] = useState(0);
  const [refreshUsersVersion, setRefreshUsersVersion] = useState(0);

  useEffect(() => {
    if (document.querySelector("script[data-admin-tailwind]")) return;
    const script = document.createElement("script");
    script.src = "https://cdn.tailwindcss.com";
    script.async = true;
    script.dataset.adminTailwind = "true";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const verifyAccess = async () => {
      try {
        const session = await adminFetch<AuthResponse>("/api/auth/me");
        if (!session.authenticated || !session.user?.isWhitelisted) {
          window.location.replace("/");
          return;
        }
        if (!cancelled) {
          setAdminEmail(session.user.email);
          setAuthorized(true);
        }
      } catch {
        if (!cancelled) setError(text.loadError);
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    };
    void verifyAccess();
    return () => { cancelled = true; };
  }, [text.loadError]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    setLoadingStats(true);
    setError("");
    void adminFetch<AdminStats>("/api/admin/stats")
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => { if (!cancelled) setError(text.loadError); })
      .finally(() => { if (!cancelled) setLoadingStats(false); });
    return () => { cancelled = true; };
  }, [authorized, refreshStatsVersion, text.loadError]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoadingUsers(true);
    const timer = window.setTimeout(() => {
      const query = search.trim()
        ? `?email=${encodeURIComponent(search.trim())}`
        : "";
      void adminFetch<{ users: AdminUser[] }>(`/api/admin/users${query}`, {
        signal: controller.signal,
      })
        .then((data) => { if (!cancelled) setUsers(data.users); })
        .catch((requestError: unknown) => {
          if (!cancelled && !(requestError instanceof DOMException && requestError.name === "AbortError")) {
            setError(text.loadError);
          }
        })
        .finally(() => { if (!cancelled) setLoadingUsers(false); });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authorized, search, refreshUsersVersion, text.loadError]);

  const runUserAction = async (user: AdminUser, action: "toggle-whitelist" | "grant-premium") => {
    setPendingUserId(user.id);
    setError("");
    try {
      const result = await adminFetch<{ user: AdminUser }>(
        `/api/admin/users/${user.id}/${action}`,
        { method: "POST" },
      );
      setUsers((current) => current.map((entry) =>
        entry.id === result.user.id ? result.user : entry,
      ));
      if (result.user.email === adminEmail && !result.user.isWhitelisted) {
        window.location.replace("/");
        return;
      }
      if (action === "grant-premium") {
        setRefreshStatsVersion((version) => version + 1);
      }
    } catch {
      setError(text.loadError);
    } finally {
      setPendingUserId(null);
    }
  };

  const toggleLanguage = () => {
    const next = language === "en" ? "ru" : "en";
    setLanguage(next);
    try { window.localStorage.setItem("text-to-bpmn-language", next); } catch { /* Storage may be unavailable. */ }
  };

  if (checkingAccess || !authorized) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-600">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {checkingAccess ? text.loading : error || text.loadError}
        </div>
      </main>
    );
  }

  const statsCards = [
    { title: text.totalUsers, value: stats?.totalUsers, icon: Users, color: "text-sky-700 bg-sky-50" },
    { title: text.activePremium, value: stats?.activePremiumSubscriptions, icon: Crown, color: "text-amber-700 bg-amber-50" },
    { title: text.totalGenerations, value: stats?.totalGenerations, icon: ShieldCheck, color: "text-teal-700 bg-teal-50" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Text-to-BPMN</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{text.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{text.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{text.signedInAs} <strong className="text-slate-700">{adminEmail}</strong></span>
            <button type="button" onClick={toggleLanguage} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100">
              {text.language}
            </button>
            <button type="button" onClick={() => window.location.assign("/")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100">
              <ArrowLeft size={16} /> {text.back}
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mb-6 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <span>{error}</span>
            <button type="button" onClick={() => { setError(""); setRefreshStatsVersion((version) => version + 1); setRefreshUsersVersion((version) => version + 1); }} className="font-semibold underline">{text.retry}</button>
          </div>
        )}

        <section aria-label={text.title} className="mb-8 grid gap-4 md:grid-cols-3">
          {statsCards.map(({ title, value, icon: Icon, color }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{title}</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight">
                    {loadingStats || value === undefined ? <span className="text-slate-300">—</span> : value.toLocaleString(language === "ru" ? "ru-RU" : "en-US")}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${color}`}><Icon size={20} /></div>
              </div>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-lg font-semibold">{text.user}</h2>
              <p className="mt-1 text-sm text-slate-500">{loadingUsers ? text.refreshing : `${users.length} ${language === "ru" ? "пользователей" : "users"}`}</p>
            </div>
            <label className="relative block w-full sm:w-80">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={text.search}
                aria-label={text.search}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-100"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">{text.user}</th>
                  <th className="px-5 py-3 font-semibold">{text.premium}</th>
                  <th className="px-5 py-3 font-semibold">{text.whitelist}</th>
                  <th className="px-5 py-3 font-semibold">{text.freeLeft}</th>
                  <th className="px-5 py-3 font-semibold">{text.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingUsers && users.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">{text.loadingData}</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">{text.noUsers}</td></tr>
                ) : users.map((user) => {
                  const activePremium = user.isPremium && Boolean(user.premiumUntil && new Date(user.premiumUntil).getTime() > Date.now());
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">{user.email}</div>
                        <div className="mt-1 text-xs text-slate-400">ID {user.id}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${activePremium ? "bg-amber-50 text-amber-800" : user.isPremium ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-500"}`}>
                          {activePremium ? text.active : user.isPremium ? text.expired : text.inactive}
                        </span>
                        <div className="mt-1 text-xs text-slate-400">{formatDate(user.premiumUntil, language)}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.isWhitelisted ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                          {user.isWhitelisted ? text.enabled : text.disabled}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-700">{user.freeGenerationsLeft}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={pendingUserId === user.id}
                            onClick={() => void runUserAction(user, "toggle-whitelist")}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-50"
                          >
                            {user.isWhitelisted ? text.removeWhitelist : text.addWhitelist}
                          </button>
                          <button
                            type="button"
                            disabled={pendingUserId === user.id}
                            onClick={() => void runUserAction(user, "grant-premium")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-50"
                          >
                            {pendingUserId === user.id ? <RefreshCw size={13} className="animate-spin" /> : <Crown size={13} />}
                            {activePremium ? text.extendPremium : text.grantPremium}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
