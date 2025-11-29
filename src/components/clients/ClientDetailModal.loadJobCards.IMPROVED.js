// IMPROVED loadJobCards function - Replace the existing one in ClientDetailModal.jsx
// This version always fetches ALL job cards and filters client-side for maximum reliability

const loadJobCards = async () => {
    if (!client?.id) {
        setJobCards([]);
        return;
    }
    
    setLoadingJobCards(true);
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            setLoadingJobCards(false);
            return;
        }
        
        const normalizedClientName = (client.name || '').trim().toLowerCase();
        const clientIdToMatch = client.id;
        
        // Extract base name (remove common suffixes)
        const baseName = normalizedClientName
            .replace(/\s*\(pty\)\s*ltd\.?/gi, '')
            .replace(/\s*ltd\.?/gi, '')
            .replace(/\s*inc\.?/gi, '')
            .trim();
        
        console.log('🔍 Loading job cards for client:', {
            clientId: clientIdToMatch,
            clientName: client.name,
            normalizedName: normalizedClientName,
            baseName: baseName
        });
        
        // ALWAYS fetch ALL job cards for maximum reliability
        let allJobCards = [];
        try {
            const response = await fetch(`/api/jobcards?pageSize=5000`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                allJobCards = data.jobCards || [];
                console.log(`📋 Fetched ALL job cards: ${allJobCards.length} total`);
            } else {
                console.error('Failed to fetch job cards:', response.statusText);
                setJobCards([]);
                return;
            }
        } catch (error) {
            console.error('Error fetching all job cards:', error);
            setJobCards([]);
            return;
        }
        
        // Filter with very flexible matching
        const clientJobCards = allJobCards.filter(jc => {
            // 1. Exact clientId match (highest priority)
            if (jc.clientId === clientIdToMatch) {
                console.log('✅ Matched by clientId:', jc.jobCardNumber, '(', jc.clientId, ')');
                return true;
            }
            
            // 2. Normalize job card client name
            const jcClientName = (jc.clientName || '').trim();
            const normalizedJcClientName = jcClientName.toLowerCase();
            
            if (!normalizedJcClientName) return false;
            
            // 3. Exact case-insensitive name match
            if (normalizedJcClientName === normalizedClientName) {
                console.log('✅ Matched by exact name:', jc.jobCardNumber, '(', jcClientName, ')');
                return true;
            }
            
            // 4. Base name match (without suffixes)
            if (baseName && baseName.length > 0) {
                const jcBaseName = normalizedJcClientName
                    .replace(/\s*\(pty\)\s*ltd\.?/gi, '')
                    .replace(/\s*ltd\.?/gi, '')
                    .replace(/\s*inc\.?/gi, '')
                    .trim();
                
                if (jcBaseName === baseName && jcBaseName.length > 0) {
                    console.log('✅ Matched by base name:', jc.jobCardNumber, '(', jcClientName, '→', jcBaseName, ')');
                    return true;
                }
            }
            
            // 5. Substring matches (minimum 5 chars to avoid false positives)
            if (normalizedClientName.length >= 5 && normalizedJcClientName.includes(normalizedClientName)) {
                console.log('✅ Matched by substring:', jc.jobCardNumber, '(', jcClientName, 'contains', client.name, ')');
                return true;
            }
            
            if (normalizedJcClientName.length >= 5 && normalizedClientName.includes(normalizedJcClientName)) {
                console.log('✅ Matched by reverse substring:', jc.jobCardNumber);
                return true;
            }
            
            if (baseName && baseName.length >= 5 && normalizedJcClientName.includes(baseName)) {
                console.log('✅ Matched by base substring:', jc.jobCardNumber);
                return true;
            }
            
            return false;
        });
        
        console.log(`✅ Final result: ${clientJobCards.length} job cards found for client`);
        
        if (clientJobCards.length === 0 && allJobCards.length > 0) {
            console.warn('⚠️ No matches found. Sample job cards in DB:', allJobCards.slice(0, 5).map(jc => ({
                number: jc.jobCardNumber,
                clientId: jc.clientId || '(null)',
                clientName: jc.clientName || '(empty)'
            })));
            console.warn('⚠️ Searching for:', {
                clientId: clientIdToMatch,
                clientName: client.name
            });
        }
        
        setJobCards(clientJobCards);
    } catch (error) {
        console.error('❌ Error loading job cards:', error);
        setJobCards([]);
    } finally {
        setLoadingJobCards(false);
    }
};

