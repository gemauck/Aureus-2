// Company Group Selector Component
const { useState, useEffect, useCallback } = React;

const CompanyGroupSelector = ({ 
    clientId, 
    currentGroupMemberships = [], 
    onGroupMembershipsChange,
    isDark = false 
}) => {
    const [allGroups, setAllGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [groupMemberships, setGroupMemberships] = useState(currentGroupMemberships || []);
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [availableGroups, setAvailableGroups] = useState([]);

    // Fetch all available groups (clients that can be parent groups)
    useEffect(() => {
        const fetchGroups = async () => {
            try {
                setLoading(true);
                
                // Fetch all clients that could be groups (exclude current client)
                const response = await window.api?.get?.('/clients') || await fetch('/api/clients').then(r => r.json());
                const clients = response?.data?.clients || response?.clients || [];
                
                // Filter to exclude current client and get potential groups
                const potentialGroups = clients
                    .filter(c => c.id !== clientId && c.type === 'group')
                    .map(c => ({ id: c.id, name: c.name, type: c.type, industry: c.industry }));
                
                setAvailableGroups(potentialGroups.filter(g => !groupMemberships.some(gm => gm.groupId === g.id)));
                setAllGroups(potentialGroups);
            } catch (error) {
                console.error('Failed to fetch groups:', error);
            } finally {
                setLoading(false);
            }
        };

        if (clientId) {
            fetchGroups();
        }
    }, [clientId]);

    // Fetch current client's group data
    useEffect(() => {
        const fetchClientGroups = async () => {
            if (!clientId) return;
            
            try {
                const response = await window.api?.get?.(`/clients/${clientId}/groups`) || 
                                await fetch(`/api/clients/${clientId}/groups`).then(r => {
                                    if (!r.ok) {
                                        if (r.status === 500) {
                                            console.warn(`⚠️ Server error loading groups for client ${clientId}. Continuing without group data.`);
                                            return { data: { groupMemberships: [] } };
                                        }
                                        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
                                    }
                                    return r.json();
                                });
                
                const data = response?.data || response || {};
                
                if (data.groupMemberships) {
                    setGroupMemberships(data.groupMemberships);
                    if (onGroupMembershipsChange) {
                        onGroupMembershipsChange(data.groupMemberships);
                    }
                }
            } catch (error) {
                console.error('❌ Failed to fetch client groups:', error);
                // Continue with empty groups rather than breaking the UI
                setGroupMemberships([]);
            }
        };

        fetchClientGroups();
    }, [clientId]);


    const handleAddToGroup = async (groupId) => {
        if (!clientId || !groupId) return;
        
        try {
            const response = await window.api?.post?.(`/clients/${clientId}/groups`, { groupId, role: 'member' }) ||
                            await fetch(`/api/clients/${clientId}/groups`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ groupId, role: 'member' })
                            }).then(r => r.json());
            
            const membership = response?.data?.membership || response?.membership;
            if (membership) {
                const newMembership = {
                    id: membership.id,
                    groupId: membership.group?.id || groupId,
                    group: membership.group,
                    role: membership.role || 'member'
                };
                
                const updated = [...groupMemberships, newMembership];
                setGroupMemberships(updated);
                if (onGroupMembershipsChange) {
                    onGroupMembershipsChange(updated);
                }
                setShowAddGroupModal(false);
                
                // Trigger refresh of main clients/leads list
                window.dispatchEvent(new CustomEvent('clientGroupUpdated', { 
                    detail: { clientId, action: 'added' } 
                }));
                
                // Force LiveDataSync to refresh if available
                if (window.LiveDataSync?.forceSync) {
                    window.LiveDataSync.forceSync().catch(() => {});
                }
                
                // Refresh available groups
                const available = allGroups.filter(g => 
                    !updated.some(gm => gm.groupId === g.id)
                );
                setAvailableGroups(available);
            }
        } catch (error) {
            console.error('❌ Failed to add client to group:', error);
            const errorMessage = error?.message || 'Unknown error';
            const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error');
            
            if (isServerError) {
                alert('❌ Server error: Unable to add client to group. This may be due to a database issue. Please contact support if this persists.');
            } else {
                alert(`❌ Failed to add client to group: ${errorMessage}`);
            }
        }
    };

    const handleRemoveFromGroup = async (groupId) => {
        if (!clientId || !groupId) return;
        
        if (!confirm('Remove this client from the group?')) return;
        
        try {
            await window.api?.delete?.(`/clients/${clientId}/groups/${groupId}`) ||
                  await fetch(`/api/clients/${clientId}/groups/${groupId}`, {
                      method: 'DELETE'
                  });
            
            const updated = groupMemberships.filter(gm => gm.groupId !== groupId);
            setGroupMemberships(updated);
            if (onGroupMembershipsChange) {
                onGroupMembershipsChange(updated);
            }
            
            // Trigger refresh of main clients/leads list
            window.dispatchEvent(new CustomEvent('clientGroupUpdated', { 
                detail: { clientId, action: 'removed' } 
            }));
            
            // Force LiveDataSync to refresh if available
            if (window.LiveDataSync?.forceSync) {
                window.LiveDataSync.forceSync().catch(() => {});
            }
            
            // Refresh available groups
            const available = allGroups.filter(g => 
                !updated.some(gm => gm.groupId === g.id)
            );
            setAvailableGroups(available);
        } catch (error) {
            console.error('❌ Failed to remove client from group:', error);
            const errorMessage = error?.message || 'Unknown error';
            const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error');
            
            if (isServerError) {
                alert('❌ Server error: Unable to remove client from group. This may be due to a database issue. Please contact support if this persists.');
            } else {
                alert(`❌ Failed to remove client from group: ${errorMessage}`);
            }
        }
    };

    if (loading) {
        return (
            <div className={`p-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Loading groups...
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            {/* Group Memberships */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Additional Group Memberships
                    </label>
                    <button
                        onClick={() => setShowAddGroupModal(true)}
                        className={`px-3 py-1 text-sm rounded-md ${
                            isDark
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                        } transition-colors`}
                    >
                        + Add Group
                    </button>
                </div>
                
                {groupMemberships.length > 0 ? (
                    <div className="space-y-2">
                        {groupMemberships.map((membership) => (
                            <div
                                key={membership.id || membership.groupId}
                                className={`flex items-center justify-between p-2 rounded-md ${
                                    isDark ? 'bg-gray-700' : 'bg-gray-50'
                                }`}
                            >
                                <div>
                                    <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                        {membership.group?.name || 'Unknown Group'}
                                    </span>
                                    {membership.role && membership.role !== 'member' && (
                                        <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            ({membership.role})
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleRemoveFromGroup(membership.groupId)}
                                    className={`px-2 py-1 text-xs rounded ${
                                        isDark
                                            ? 'bg-red-600 hover:bg-red-700 text-white'
                                            : 'bg-red-500 hover:bg-red-600 text-white'
                                    } transition-colors`}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        No additional group memberships. Click "Add Group" to assign this client to additional groups.
                    </p>
                )}
                
                <p className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Assign this client to multiple groups for flexible categorization
                </p>
            </div>

            {/* Add Group Modal */}
            {showAddGroupModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4`}>
                        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Add to Group
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Select Group
                                </label>
                                <select
                                    id="groupSelect"
                                    className={`w-full px-3 py-2 rounded-md border ${
                                        isDark 
                                            ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                            : 'bg-white border-gray-300 text-gray-900'
                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                >
                                    <option value="">Select a group...</option>
                                    {availableGroups
                                        .filter(g => g.id !== clientId)
                                        .map((group) => (
                                            <option key={group.id} value={group.id}>
                                                {group.name}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowAddGroupModal(false)}
                                    className={`px-4 py-2 rounded-md ${
                                        isDark
                                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                                            : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                    } transition-colors`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const select = document.getElementById('groupSelect');
                                        const groupId = select?.value;
                                        if (groupId) {
                                            handleAddToGroup(groupId);
                                        }
                                    }}
                                    className={`px-4 py-2 rounded-md ${
                                        isDark
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                                    } transition-colors`}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Register component globally
if (typeof window !== 'undefined') {
    window.CompanyGroupSelector = CompanyGroupSelector;
}

