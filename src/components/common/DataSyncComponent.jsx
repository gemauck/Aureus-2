// Data Synchronization Component
const { useState, useEffect } = React;

const DataSyncComponent = ({ onDataSynced }) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [lastSync, setLastSync] = useState(null);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const { isDark } = window.useTheme();

    // Load sync status on mount
    useEffect(() => {
        updateSyncStatus();
    }, []);

    // Update sync status
    const updateSyncStatus = () => {
        const status = window.DataSync?.getSyncStatus?.();
        setSyncStatus(status);
        setLastSync(status?.lastSync);
    };

    // Handle sync
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            console.log('🔄 Starting data synchronization...');
            const syncedData = await window.DataSync?.syncData?.();
            
            if (syncedData) {
                window.DataSync?.updateLastSync?.();
                updateSyncStatus();
                
                if (onDataSynced) {
                    onDataSynced(syncedData);
                }
                
                alert('✅ Data synchronized successfully across devices!');
            } else {
                alert('⚠️ Sync completed using local data only');
            }
        } catch (error) {
            console.error('❌ Sync failed:', error);
            alert('❌ Data synchronization failed. Please try again.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Handle force sync
    const handleForceSync = async () => {
        if (!confirm('This will reload all data from the server. Continue?')) return;
        
        setIsSyncing(true);
        try {
            console.log('🔄 Force syncing data from server...');
            const syncedData = await window.DataSync?.forceSync?.();
            
            if (syncedData) {
                window.DataSync?.updateLastSync?.();
                updateSyncStatus();
                
                if (onDataSynced) {
                    onDataSynced(syncedData);
                }
                
                alert('✅ Data force synced from server successfully!');
            }
        } catch (error) {
            console.error('❌ Force sync failed:', error);
            alert('❌ Force sync failed. Please try again.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Handle clear and reload
    const handleClearAndReload = async () => {
        if (!confirm('This will clear all local data and reload from server. This action cannot be undone. Continue?')) return;
        
        setIsSyncing(true);
        try {
            console.log('🧹 Clearing local data and reloading...');
            const syncedData = await window.DataSync?.clearAndReload?.();
            
            if (syncedData) {
                window.DataSync?.updateLastSync?.();
                updateSyncStatus();
                
                if (onDataSynced) {
                    onDataSynced(syncedData);
                }
                
                alert('✅ Local data cleared and reloaded from server!');
            }
        } catch (error) {
            console.error('❌ Clear and reload failed:', error);
            alert('❌ Clear and reload failed. Please try again.');
        } finally {
            setIsSyncing(false);
        }
    };

    // Format last sync time
    const formatLastSync = (timestamp) => {
        if (!timestamp || timestamp === 'Never') return 'Never';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString();
        } catch {
            return 'Unknown';
        }
    };

    return (
        <div className="space-y-4">
            {/* Sync Status Card */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        Data Synchronization
                    </h3>
                    <button
                        onClick={() => setShowSyncModal(true)}
                        className={`px-3 py-2 text-sm rounded-lg ${
                            isDark 
                                ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <i className="fas fa-cog mr-2"></i>
                        Settings
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Clients</p>
                                <p className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    {syncStatus?.clientsCount || 0}
                                </p>
                            </div>
                            <i className="fas fa-building text-2xl text-blue-600"></i>
                        </div>
                    </div>

                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Leads</p>
                                <p className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    {syncStatus?.leadsCount || 0}
                                </p>
                            </div>
                            <i className="fas fa-user-plus text-2xl text-green-600"></i>
                        </div>
                    </div>

                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Projects</p>
                                <p className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    {syncStatus?.projectsCount || 0}
                                </p>
                            </div>
                            <i className="fas fa-project-diagram text-2xl text-purple-600"></i>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            Last Sync: {formatLastSync(lastSync)}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            {syncStatus?.hasToken ? 'Connected to server' : 'Offline mode'}
                        </p>
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`px-4 py-2 rounded-lg font-medium ${
                            isSyncing
                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                : 'bg-primary-600 text-white hover:bg-primary-700'
                        }`}
                    >
                        {isSyncing ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Syncing...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-sync mr-2"></i>
                                Sync Now
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Sync Modal */}
            {showSyncModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl w-full max-w-md`}>
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    Sync Settings
                                </h3>
                                <button
                                    onClick={() => setShowSyncModal(false)}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>
                                        Force Sync from Server
                                    </h4>
                                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                                        Reload all data from the server, overwriting local changes.
                                    </p>
                                    <button
                                        onClick={handleForceSync}
                                        disabled={isSyncing}
                                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        <i className="fas fa-download mr-2"></i>
                                        Force Sync
                                    </button>
                                </div>

                                <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>
                                        Clear & Reload
                                    </h4>
                                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                                        Clear all local data and reload from server. Use with caution!
                                    </p>
                                    <button
                                        onClick={handleClearAndReload}
                                        disabled={isSyncing}
                                        className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
                                    >
                                        <i className="fas fa-trash mr-2"></i>
                                        Clear & Reload
                                    </button>
                                </div>

                                <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-4`}>
                                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2`}>
                                        Sync Status
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Server Connection:</span>
                                            <span className={syncStatus?.hasToken ? 'text-green-600' : 'text-red-600'}>
                                                {syncStatus?.hasToken ? 'Connected' : 'Offline'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Last Sync:</span>
                                            <span className={isDark ? 'text-gray-300' : 'text-gray-900'}>
                                                {formatLastSync(lastSync)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.DataSyncComponent = DataSyncComponent;
