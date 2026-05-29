import { STOCK_TAKE_AVAILABILITY_OPTIONS } from '../../utils/stockTakeAvailability.js';

/**
 * Segmented control: All / In stock / Out of stock (system qty at selected location).
 */
export function StockTakeAvailabilityFilter({ value = 'all', onChange, isDark = false, className = '' }) {
  return (
    <div
      role="group"
      aria-label="Filter by stock on hand at this location"
      className={`flex w-full rounded-lg border p-0.5 gap-0.5 ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-gray-100'} ${className}`.trim()}
    >
      {STOCK_TAKE_AVAILABILITY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(opt.value)}
            className={
              'flex-1 min-w-0 rounded-md px-2 py-1.5 text-xs font-semibold touch-manipulation transition-colors ' +
              (active
                ? isDark
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : isDark
                  ? 'text-gray-400 hover:text-gray-200'
                  : 'text-gray-600 hover:text-gray-900')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
