// Shared leave-management helpers for HR and Leave Platform modules
// Ensures South African Basic Conditions of Employment Act (BCEA) compliance

const BCEA_LEAVE_TYPES = [
    { value: 'annual', label: 'Annual Leave', defaultDays: 21, color: 'blue', icon: 'fa-umbrella-beach' },
    { value: 'sick', label: 'Sick Leave', defaultDays: 30, color: 'red', icon: 'fa-heartbeat' },
    { value: 'family', label: 'Family Responsibility', defaultDays: 3, color: 'purple', icon: 'fa-home' },
    { value: 'maternity', label: 'Maternity Leave', defaultDays: 120, color: 'pink', icon: 'fa-baby' },
    { value: 'paternity', label: 'Paternity Leave', defaultDays: 10, color: 'teal', icon: 'fa-baby-carriage' },
    { value: 'study', label: 'Study Leave', defaultDays: 0, color: 'orange', icon: 'fa-book' },
    { value: 'unpaid', label: 'Unpaid Leave', defaultDays: 0, color: 'gray', icon: 'fa-money-bill-wave' },
    { value: 'compassionate', label: 'Compassionate Leave', defaultDays: 3, color: 'indigo', icon: 'fa-hands-helping' },
    { value: 'religious', label: 'Religious Holiday', defaultDays: 0, color: 'amber', icon: 'fa-star-and-crescent' }
];

// Public holidays sourced from South African Government Gazette (covers rolling three-year window)
const SOUTH_AFRICAN_PUBLIC_HOLIDAYS = {
    2024: [
        { date: '2024-01-01', name: "New Year's Day" },
        { date: '2024-03-21', name: 'Human Rights Day' },
        { date: '2024-03-29', name: 'Good Friday' },
        { date: '2024-04-01', name: 'Family Day' },
        { date: '2024-04-27', name: 'Freedom Day' },
        { date: '2024-05-01', name: 'Workers Day' },
        { date: '2024-06-16', name: 'Youth Day' },
        { date: '2024-06-17', name: 'Youth Day (observed)' },
        { date: '2024-08-09', name: "National Women's Day" },
        { date: '2024-09-24', name: 'Heritage Day' },
        { date: '2024-12-16', name: 'Day of Reconciliation' },
        { date: '2024-12-25', name: 'Christmas Day' },
        { date: '2024-12-26', name: 'Day of Goodwill' }
    ],
    2025: [
        { date: '2025-01-01', name: "New Year's Day" },
        { date: '2025-03-21', name: 'Human Rights Day' },
        { date: '2025-04-18', name: 'Good Friday' },
        { date: '2025-04-21', name: 'Family Day' },
        { date: '2025-04-27', name: 'Freedom Day' },
        { date: '2025-04-28', name: 'Freedom Day (observed)' },
        { date: '2025-05-01', name: 'Workers Day' },
        { date: '2025-06-16', name: 'Youth Day' },
        { date: '2025-08-09', name: "National Women's Day" },
        { date: '2025-09-24', name: 'Heritage Day' },
        { date: '2025-12-16', name: 'Day of Reconciliation' },
        { date: '2025-12-25', name: 'Christmas Day' },
        { date: '2025-12-26', name: 'Day of Goodwill' }
    ],
    2026: [
        { date: '2026-01-01', name: "New Year's Day" },
        { date: '2026-03-21', name: 'Human Rights Day' },
        { date: '2026-04-03', name: 'Good Friday' },
        { date: '2026-04-06', name: 'Family Day' },
        { date: '2026-04-27', name: 'Freedom Day' },
        { date: '2026-05-01', name: 'Workers Day' },
        { date: '2026-06-16', name: 'Youth Day' },
        { date: '2026-08-10', name: "National Women's Day (observed)" },
        { date: '2026-09-24', name: 'Heritage Day' },
        { date: '2026-12-16', name: 'Day of Reconciliation' },
        { date: '2026-12-25', name: 'Christmas Day' },
        { date: '2026-12-28', name: 'Day of Goodwill (observed)' }
    ]
};

const STATUS_COLORS = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800'
};

const STATUS_LABELS = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled'
};

function getPublicHolidaysForYear(year) {
    const holidays = SOUTH_AFRICAN_PUBLIC_HOLIDAYS[year];
    if (holidays) return holidays;
    
    // Basic fallback: return an empty list to avoid blocking calculations if the year is out of range
    return [];
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

function calculateWorkingDays(startDate, endDate, options = {}) {
    if (!startDate || !endDate) return 0;
    
    const {
        excludePublicHolidays = true,
        publicHolidays = null
    } = options;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
        return 0;
    }
    
    const holidaysByDate = new Set();
    if (excludePublicHolidays) {
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();
        const years = [];
        for (let year = startYear; year <= endYear; year++) {
            years.push(year);
        }
        
        years.forEach(year => {
            const yearHolidays = publicHolidays || getPublicHolidaysForYear(year);
            yearHolidays.forEach(holiday => holidaysByDate.add(holiday.date));
        });
    }
    
    let count = 0;
    const dateIterator = new Date(start);
    while (dateIterator <= end) {
        if (!isWeekend(dateIterator)) {
            const isoDate = dateIterator.toISOString().split('T')[0];
            if (!holidaysByDate.has(isoDate)) {
                count += 1;
            }
        }
        dateIterator.setDate(dateIterator.getDate() + 1);
    }
    
    return count;
}

function getLeaveTypeInfo(type) {
    return BCEA_LEAVE_TYPES.find(t => t.value === type) || BCEA_LEAVE_TYPES[0];
}

function getStatusColor(status) {
    return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

function getStatusLabel(status) {
    return STATUS_LABELS[status] || status;
}

const leaveUtils = {
    BCEA_LEAVE_TYPES,
    SOUTH_AFRICAN_PUBLIC_HOLIDAYS,
    STATUS_COLORS,
    STATUS_LABELS,
    calculateWorkingDays,
    getLeaveTypeInfo,
    getStatusColor,
    getStatusLabel,
    getPublicHolidaysForYear
};

if (typeof window !== 'undefined') {
    window.leaveUtils = leaveUtils;
}


