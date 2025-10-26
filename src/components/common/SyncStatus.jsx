// Sync Status Component - Shows data synchronization state
const SyncStatus = ({ status, lastSyncTime, pendingCount, compact = false, onSync }) => {
  const { isDark } = window.useTheme();
  
  const getStatusInfo = () => {
    switch (status) {
      case 'synced':
        return { 
          icon: 'fa-check-circle', 
          color: 'text-green-500', 
          bgColor: isDark ? 'bg-green-900/20' : 'bg-green-50',
          label: 'Synced',
          description: 'All changes saved'
        };
      case 'dirty':
      case 'syncing':
        return { 
          icon: 'fa-sync fa-spin', 
          color: 'text-yellow-500', 
          bgColor: isDark ? 'bg-yellow-900/20' : 'bg-yellow-50',
          label: 'Syncing...',
          description: 'Saving changes'
        };
      case 'error':
        return { 
          icon: 'fa-exclamation-circle', 
          color: 'text-red-500', 
          bgColor: isDark ? 'bg-red-900/20' : 'bg-red-50',
          label: 'Sync Error',
          description: 'Will retry automatically'
        };
      default:
        return { 
          icon: 'fa-circle', 
          color: 'text-gray-400', 
          bgColor: isDark ? 'bg-gray-800' : 'bg-gray-100',
          label: 'Unknown',
          description: ''
        };
    }
  };
  
  const statusInfo = getStatusInfo();
  
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  
  const timeAgo = formatTimeAgo(lastSyncTime);
  
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <i className={`fas ${statusInfo.icon} ${statusInfo.color} text-sm`} title={statusInfo.description}></i>
        {pendingCount > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isDark ? 'bg-yellow-900/30 text-yellow-200' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {pendingCount} pending
          </span>
        )}
        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {timeAgo}
        </span>
      </div>
    );
  }
  
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusInfo.bgColor} ${
      isDark ? 'border-gray-700' : 'border-gray-200'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${statusInfo.bgColor}`}>
        <i className={`fas ${statusInfo.icon} ${statusInfo.color}`}></i>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
          {statusInfo.label}
        </div>
        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {statusInfo.description} · Last sync: {timeAgo}
        </div>
      </div>
      {pendingCount > 0 && (
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          isDark ? 'bg-yellow-900/30 text-yellow-200' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {pendingCount} pending
        </div>
      )}
      {onSync && (
        <button
          onClick={onSync}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            isDark 
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
          title="Force sync now"
        >
          <i className="fas fa-sync mr-1"></i>
          Sync Now
        </button>
      )}
    </div>
  );
};

// Make available globally
window.SyncStatus = SyncStatus;
