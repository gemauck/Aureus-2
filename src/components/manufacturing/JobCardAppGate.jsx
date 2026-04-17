/**
 * Enforces login for the standalone /job-card app (wrapped by AuthProvider in App.jsx).
 */
const { useState, useEffect } = React;
const useAuth = window.useAuth;

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading job card form…</p>
        </div>
      </div>
    );
  }

  if (authLoading && (token || window.storage?.getUser?.())) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Signing you in…</p>
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-800 font-medium text-center">Sign in required</p>
        <p className="text-sm text-gray-600 mt-2 text-center">
          The Job Card app requires an ERP account. Open the main site to log in, then return to this page.
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
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold"
        >
          Go to login
        </button>
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
