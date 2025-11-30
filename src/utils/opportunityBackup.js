// Opportunity Backup System
// This provides localStorage backup functionality without interfering with existing code

class OpportunityBackup {
    constructor() {
        this.BACKUP_KEY = 'opportunities_backup';
        this.BACKUP_VERSION = '1.0';
        this.MAX_BACKUPS = 50; // Keep last 50 opportunities as backup
    }

    // Get all backed up opportunities
    getBackups() {
        try {
            const backups = localStorage.getItem(this.BACKUP_KEY);
            return backups ? JSON.parse(backups) : [];
        } catch (error) {
            console.error('❌ Error reading backup:', error);
            return [];
        }
    }

    // Add opportunity to backup
    addBackup(opportunity) {
        try {
            const backups = this.getBackups();
            
            // Add timestamp and version info
            const backupEntry = {
                ...opportunity,
                backupTimestamp: new Date().toISOString(),
                backupVersion: this.BACKUP_VERSION,
                backupId: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            
            // Add to beginning of array (most recent first)
            backups.unshift(backupEntry);
            
            // Keep only the most recent backups
            if (backups.length > this.MAX_BACKUPS) {
                backups.splice(this.MAX_BACKUPS);
            }
            
            localStorage.setItem(this.BACKUP_KEY, JSON.stringify(backups));
            
            return backupEntry;
        } catch (error) {
            console.error('❌ Error creating backup:', error);
            return null;
        }
    }

    // Update opportunity in backup
    updateBackup(opportunityId, updatedOpportunity) {
        try {
            const backups = this.getBackups();
            const index = backups.findIndex(b => b.id === opportunityId);
            
            if (index !== -1) {
                backups[index] = {
                    ...updatedOpportunity,
                    backupTimestamp: new Date().toISOString(),
                    backupVersion: this.BACKUP_VERSION,
                    backupId: backups[index].backupId // Keep original backup ID
                };
                
                localStorage.setItem(this.BACKUP_KEY, JSON.stringify(backups));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Error updating backup:', error);
            return false;
        }
    }

    // Remove opportunity from backup
    removeBackup(opportunityId) {
        try {
            const backups = this.getBackups();
            const filteredBackups = backups.filter(b => b.id !== opportunityId);
            
            if (filteredBackups.length !== backups.length) {
                localStorage.setItem(this.BACKUP_KEY, JSON.stringify(filteredBackups));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ Error removing backup:', error);
            return false;
        }
    }

    // Get backup statistics
    getBackupStats() {
        const backups = this.getBackups();
        return {
            totalBackups: backups.length,
            latestBackup: backups.length > 0 ? backups[0].backupTimestamp : null,
            oldestBackup: backups.length > 0 ? backups[backups.length - 1].backupTimestamp : null,
            storageUsed: this.getStorageSize()
        };
    }

    // Get storage size used by backups
    getStorageSize() {
        try {
            const backups = localStorage.getItem(this.BACKUP_KEY);
            return backups ? new Blob([backups]).size : 0;
        } catch (error) {
            return 0;
        }
    }

    // Export backups as JSON
    exportBackups() {
        const backups = this.getBackups();
        const exportData = {
            version: this.BACKUP_VERSION,
            exportTimestamp: new Date().toISOString(),
            totalBackups: backups.length,
            opportunities: backups
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `opportunities_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    }

    // Clear all backups
    clearBackups() {
        try {
            localStorage.removeItem(this.BACKUP_KEY);
            return true;
        } catch (error) {
            console.error('❌ Error clearing backups:', error);
            return false;
        }
    }

    // Restore opportunity from backup (returns the opportunity data)
    restoreOpportunity(backupId) {
        try {
            const backups = this.getBackups();
            const backup = backups.find(b => b.backupId === backupId);
            
            if (backup) {
                // Remove backup-specific fields
                const { backupTimestamp, backupVersion, backupId: _, ...opportunity } = backup;
                return opportunity;
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error restoring backup:', error);
            return null;
        }
    }
}

// Create global instance
window.OpportunityBackup = new OpportunityBackup();

// Test the backup system
window.testOpportunityBackup = () => {
    
    // Test 1: Add backup
    const testOpportunity = {
        id: 'test_123',
        title: 'Test Opportunity',
        clientId: 'client_123',
        stage: 'prospect',
        value: 50000
    };
    
    const backup = window.OpportunityBackup.addBackup(testOpportunity);
    
    // Test 2: Get backups
    const backups = window.OpportunityBackup.getBackups();
    
    // Test 3: Update backup
    const updated = window.OpportunityBackup.updateBackup('test_123', { ...testOpportunity, title: 'Updated Test' });
    
    // Test 4: Get stats
    const stats = window.OpportunityBackup.getBackupStats();
    
    // Test 5: Remove backup
    const removed = window.OpportunityBackup.removeBackup('test_123');
    
    return { backups: window.OpportunityBackup.getBackups(), stats: window.OpportunityBackup.getBackupStats() };
};

