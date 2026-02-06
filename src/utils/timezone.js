const SA_TIME_ZONE = 'Africa/Johannesburg';
const DEFAULT_LOCALE = 'en-ZA';

function withTimeZone(options) {
  if (options && options.timeZone) return options;
  return { ...(options || {}), timeZone: SA_TIME_ZONE };
}

function wrapLocaleFormatter(methodName) {
  const original = Date.prototype[methodName];
  if (!original || original.__saWrapped) return;
  const wrapped = function (locales, options) {
    const localeArg = locales == null ? DEFAULT_LOCALE : locales;
    return original.call(this, localeArg, withTimeZone(options));
  };
  wrapped.__saWrapped = true;
  Date.prototype[methodName] = wrapped;
}

wrapLocaleFormatter('toLocaleString');
wrapLocaleFormatter('toLocaleDateString');
wrapLocaleFormatter('toLocaleTimeString');

if (typeof window !== 'undefined') {
  window.SA_TIME_ZONE = SA_TIME_ZONE;
}
