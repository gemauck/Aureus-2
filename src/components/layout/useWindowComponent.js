/**
 * Poll window for a lazy-loaded global component; optionally listen for ready events.
 */
import { isReactComponent } from './windowComponentUtils.js';

/**
 * @param {object} options
 * @param {() => unknown} options.resolve
 * @param {(value: unknown) => boolean} [options.isValid]
 * @param {string|string[]} [options.readyEvents]
 * @param {(event: Event) => boolean} [options.readyEventFilter]
 * @param {string} [options.initialWindowFlag]
 * @param {number} [options.pollIntervalMs=200]
 * @param {number} [options.timeoutMs=10000]
 * @param {string} [options.timeoutWarn]
 * @param {() => void} [options.onTimeout]
 */
export function useWindowComponent({
    resolve,
    isValid = (value) => Boolean(value && typeof value === 'function'),
    readyEvents = [],
    readyEventFilter,
    initialWindowFlag,
    pollIntervalMs = 200,
    timeoutMs = 10000,
    timeoutWarn,
    onTimeout,
}) {
    const [ready, setReady] = React.useState(() => isValid(resolve()));

    React.useEffect(() => {
        const markReady = () => {
            if (isValid(resolve())) {
                setReady(true);
                return true;
            }
            return false;
        };

        if (markReady()) {
            return undefined;
        }

        if (initialWindowFlag && window[initialWindowFlag]) {
            markReady();
        }

        const eventNames = Array.isArray(readyEvents) ? readyEvents : readyEvents ? [readyEvents] : [];
        const eventHandlers = eventNames.map((eventName) => {
            const handler = readyEventFilter
                ? (event) => {
                    if (readyEventFilter(event)) {
                        markReady();
                    }
                }
                : () => {
                    markReady();
                };
            window.addEventListener(eventName, handler);
            return { eventName, handler };
        });

        const interval = setInterval(() => {
            if (markReady()) {
                clearInterval(interval);
            }
        }, pollIntervalMs);

        const timeout = timeoutMs > 0
            ? setTimeout(() => {
                clearInterval(interval);
                if (!isValid(resolve())) {
                    if (timeoutWarn) {
                        console.warn(timeoutWarn);
                    }
                    if (onTimeout) {
                        onTimeout();
                    }
                }
            }, timeoutMs)
            : null;

        return () => {
            clearInterval(interval);
            if (timeout) {
                clearTimeout(timeout);
            }
            eventHandlers.forEach(({ eventName, handler }) => {
                window.removeEventListener(eventName, handler);
            });
        };
    }, [ready]);

    return ready;
}

/**
 * @param {object} options
 * @param {boolean} options.ready
 * @param {() => unknown} options.resolve
 * @param {() => unknown} options.fallback
 * @param {(value: unknown) => boolean} [options.isValid]
 * @param {unknown[]} [options.deps]
 */
export function useResolvedWindowComponent({
    ready,
    resolve,
    fallback,
    isValid = (value) => Boolean(value && typeof value === 'function'),
    deps = [],
}) {
    return React.useMemo(() => {
        const component = resolve();
        if (isValid(component)) {
            return component;
        }
        if (isReactComponent(component)) {
            return component;
        }
        return fallback;
    }, [ready, fallback, ...deps]);
}
