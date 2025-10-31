// Calendar Component for Dashboard
const { useState, useEffect } = React;

const Calendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [notes, setNotes] = useState({}); // { '2024-01-15': 'note text' }
    const { isDark } = window.useTheme();
    
    // Load notes from localStorage on mount
    useEffect(() => {
        const loadNotes = () => {
            try {
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const savedNotes = localStorage.getItem(notesKey);
                if (savedNotes) {
                    setNotes(JSON.parse(savedNotes));
                }
            } catch (error) {
                console.error('Error loading notes:', error);
            }
        };
        loadNotes();
    }, []);
    
    // Save notes to localStorage
    const saveNotes = (dateString, noteText) => {
        try {
            const user = window.storage?.getUser?.();
            const userId = user?.id || user?.email || 'default';
            const notesKey = `user_notes_${userId}`;
            const updatedNotes = { ...notes, [dateString]: noteText };
            localStorage.setItem(notesKey, JSON.stringify(updatedNotes));
            setNotes(updatedNotes);
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    };
    
    // Get month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Get first day of month and number of days
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();
    
    // Get days array
    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
        days.push(null);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        days.push(day);
    }
    
    // Navigate months
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };
    
    const goToNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };
    
    const goToToday = () => {
        setCurrentDate(new Date());
    };
    
    // Handle day click
    const handleDayClick = (day) => {
        if (day === null) return;
        
        const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSelectedDate({ date, dateString, day });
        setShowNotesModal(true);
    };
    
    // Format date string helper
    const formatDateString = (year, month, day) => {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    
    // Check if day has notes
    const hasNotes = (day) => {
        if (day === null) return false;
        const dateString = formatDateString(currentDate.getFullYear(), currentDate.getMonth(), day);
        return notes[dateString] && notes[dateString].trim().length > 0;
    };
    
    // Check if day is today
    const isToday = (day) => {
        if (day === null) return false;
        const today = new Date();
        return (
            currentDate.getFullYear() === today.getFullYear() &&
            currentDate.getMonth() === today.getMonth() &&
            day === today.getDate()
        );
    };
    
    return (
        <>
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={goToPreviousMonth}
                            className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded transition-colors`}
                        >
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                        </h2>
                        <button
                            onClick={goToNextMonth}
                            className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded transition-colors`}
                        >
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </div>
                    <button
                        onClick={goToToday}
                        className={`text-sm ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} font-medium`}
                    >
                        Today
                    </button>
                </div>
                
                {/* Day names header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {dayNames.map(day => (
                        <div
                            key={day}
                            className={`text-center text-xs font-semibold py-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                        >
                            {day}
                        </div>
                    ))}
                </div>
                
                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                    {days.map((day, index) => {
                        if (day === null) {
                            return <div key={`empty-${index}`} className="aspect-square"></div>;
                        }
                        
                        const dateString = formatDateString(currentDate.getFullYear(), currentDate.getMonth(), day);
                        const dayHasNotes = hasNotes(day);
                        const dayIsToday = isToday(day);
                        
                        return (
                            <button
                                key={day}
                                onClick={() => handleDayClick(day)}
                                className={`
                                    aspect-square rounded transition-all
                                    ${dayIsToday 
                                        ? isDark 
                                            ? 'bg-blue-600 text-white border-2 border-blue-400' 
                                            : 'bg-blue-500 text-white border-2 border-blue-300'
                                        : isDark
                                            ? 'text-gray-200 hover:bg-gray-700 border border-gray-600'
                                            : 'text-gray-900 hover:bg-gray-100 border border-gray-200'
                                    }
                                    ${dayHasNotes ? 'font-bold' : ''}
                                    flex flex-col items-center justify-center relative
                                `}
                            >
                                <span>{day}</span>
                                {dayHasNotes && (
                                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${dayIsToday ? 'bg-white' : isDark ? 'bg-blue-400' : 'bg-blue-600'}`}></div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            
            {/* Notes Modal */}
            {showNotesModal && selectedDate && (
                <DayNotesModal
                    date={selectedDate.date}
                    dateString={selectedDate.dateString}
                    initialNote={notes[selectedDate.dateString] || ''}
                    onSave={(noteText) => {
                        saveNotes(selectedDate.dateString, noteText);
                        setShowNotesModal(false);
                    }}
                    onClose={() => setShowNotesModal(false)}
                    isDark={isDark}
                />
            )}
        </>
    );
};

// Day Notes Modal Component
const DayNotesModal = ({ date, dateString, initialNote, onSave, onClose, isDark }) => {
    const [note, setNote] = useState(initialNote || '');
    
    const formatDateDisplay = (date) => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };
    
    const handleSave = () => {
        onSave(note);
    };
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black bg-opacity-50"
                onClick={onClose}
            ></div>
            
            {/* Modal */}
            <div className={`
                relative w-full max-w-md ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl
            `}>
                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Notes for {formatDateDisplay(date)}
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                            {dateString}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} p-1 rounded`}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                
                {/* Content */}
                <div className="p-4">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Write your notes for this day..."
                        className={`
                            w-full h-64 p-3 rounded border resize-none
                            ${isDark 
                                ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            }
                            focus:outline-none focus:ring-2 focus:ring-blue-500
                        `}
                    />
                </div>
                
                {/* Footer */}
                <div className={`flex items-center justify-end space-x-2 p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <button
                        onClick={onClose}
                        className={`
                            px-4 py-2 rounded text-sm font-medium transition-colors
                            ${isDark 
                                ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                                : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                            }
                        `}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        Save Notes
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.Calendar = Calendar;

