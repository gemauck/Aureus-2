/**
 * Enforces login for the standalone /job-card app (wrapped by AuthProvider in App.jsx).
 */
const { useState, useEffect } = React;
const useAuth = window.useAuth;

const shellClass =
  'min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-6 text-center';

const JobCardAppGate = () => {
  const [jcReady, setJcReady] = useState(
    !!(window.JobCardFormPublic && typeof window.JobCardFormPublic === 'function')
  );
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (jcReady) return;
    const done = () =>
      !!(window.JobCardFormPublic && typeof window.JobCardFormPublic === 'function');
    if (done()) {
      setJcReady(true);
      return;
    }
    const onReady = () => {
      if (done()) {
        setJcReady(true);
        window.removeEventListener('jobCardFormPublicReady', onReady);
      }
    };
    window.addEventListener('jobCardFormPublicReady', onReady);
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (done() || n > 100) {
        clearInterval(t);
        if (done()) setJcReady(true);
        window.removeEventListener('jobCardFormPublicReady', onReady);
      }
    }, 100);
    return () => {
      clearInterval(t);
      window.removeEventListener('jobCardFormPublicReady', onReady);
    };
  }, [jcReady]);

  const token =
    (typeof window !== 'undefined' && window.storage?.getToken?.()) || null;

  if (!jcReady) {
    return (
      <div className={shellClass}>
        <div
          className="rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl backdrop-blur-sm max-w-sm w-full"
          style={{
            paddingTop: 'max(2.5rem, env(safe-area-inset-top))',
            paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))'
          }}
        >
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 ring-1 ring-white/10">
            <i className="fa-solid fa-clipboard-check text-2xl text-indigo-200" aria-hidden />
          </div>
          <div className="animate-spin rounded-full h-11 w-11 border-2 border-white/20 border-t-indigo-400 mx-auto mb-5" />
          <p className="text-slate-100 font-semibold text-base">Loading Job Card</p>
          <p className="text-slate-400 text-sm mt-2">Preparing the mobile form…</p>
        </div>
      </div>
    );
  }

  if (authLoading && (token || window.storage?.getUser?.())) {
    return (
      <div className={shellClass}>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur-sm max-w-sm w-full">
          <div className="animate-spin rounded-full h-11 w-11 border-2 border-white/20 border-t-indigo-400 mx-auto mb-5" />
          <p className="text-slate-100 font-semibold">Signing you in…</p>
          <p className="text-slate-400 text-sm mt-2">Restoring your session</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (window.LoginPage) {
      try {
        sessionStorage.setItem('redirectAfterLogin', '/job-card');
      } catch (_) {
        /* ignore */
      }
      return <window.LoginPage />;
    }
    return (
      <div className={`${shellClass} gap-4`}>
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 backdrop-blur-sm max-w-md w-full">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20">
            <i className="fa-solid fa-lock text-xl text-amber-200" aria-hidden />
          </div>
          <p className="text-white font-semibold text-lg">Sign in required</p>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            The Job Card app needs your ERP account. Log in on the main site, then return to this page.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem('redirectAfterLogin', '/job-card');
              } catch (_) {
                /* ignore */
              }
              window.location.assign('/');
            }}
            className="mt-6 w-full rounded-xl bg-indigo-500 px-4 py-3.5 text-white font-semibold shadow-lg shadow-indigo-900/40 hover:bg-indigo-400 active:scale-[0.99] transition touch-manipulation min-h-[48px]"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return <window.JobCardFormPublic />;
};

try {
  window.JobCardAppGate = JobCardAppGate;
} catch (e) {
  console.error('JobCardAppGate registration failed', e);
}
