/**
 * Mobile Table to Card Converter
 * Automatically converts HTML tables to mobile-friendly card layouts
 */

(function() {
    'use strict';
    
    // Check if mobile
    const isMobile = () => window.innerWidth <= 768;
    
    // Convert a table row to a card
    function rowToCard(tr, headers) {
        const card = document.createElement('div');
        card.className = 'mobile-table-card';
        
        // Get all cells
        const cells = Array.from(tr.querySelectorAll('td, th'));
        if (cells.length === 0) return null;
        
        // First cell is usually the title/primary info
        const firstCell = cells[0];
        const primaryText = firstCell.textContent.trim();
        
        // Create card header
        const cardHeader = document.createElement('div');
        cardHeader.className = 'mobile-table-card-header';
        
        const cardTitle = document.createElement('div');
        cardTitle.className = 'mobile-table-card-title';
        cardTitle.textContent = primaryText;
        cardHeader.appendChild(cardTitle);
        
        // Check if there's a status badge or action in first cell
        const badge = firstCell.querySelector('[class*="badge"], [class*="status"], span[class*="px-2"]');
        if (badge) {
            const badgeClone = badge.cloneNode(true);
            badgeClone.className += ' mobile-table-card-badge';
            cardHeader.appendChild(badgeClone);
        }
        
        card.appendChild(cardHeader);
        
        // Convert remaining cells to rows
        for (let i = 1; i < cells.length; i++) {
            const cell = cells[i];
            const header = headers[i] || `Column ${i + 1}`;
            const cellText = cell.textContent.trim();
            
            // Skip empty cells
            if (!cellText && !cell.querySelector('button, a')) continue;
            
            const row = document.createElement('div');
            row.className = 'mobile-table-card-row';
            
            const label = document.createElement('div');
            label.className = 'mobile-table-card-label';
            label.textContent = header;
            
            const value = document.createElement('div');
            value.className = 'mobile-table-card-value';
            
            // Check for buttons or links in the cell
            const actionButtons = cell.querySelectorAll('button, a');
            if (actionButtons.length > 0) {
                // Store buttons to add to actions section
                if (!card.actionButtons) card.actionButtons = [];
                actionButtons.forEach(btn => {
                    card.actionButtons.push(btn.cloneNode(true));
                });
                // Still show text if available
                if (cellText) {
                    value.textContent = cellText;
                }
            } else {
                // Check for badges or special formatting
                const innerContent = cell.cloneNode(true);
                // Clean up nested structure but keep text and basic formatting
                Array.from(innerContent.querySelectorAll('*')).forEach(el => {
                    if (el.tagName !== 'SPAN' && el.tagName !== 'DIV') {
                        const parent = el.parentNode;
                        parent.replaceChild(document.createTextNode(el.textContent), el);
                    }
                });
                value.innerHTML = innerContent.innerHTML || cellText;
            }
            
            row.appendChild(label);
            row.appendChild(value);
            card.appendChild(row);
        }
        
        // Add action buttons section if any
        if (card.actionButtons && card.actionButtons.length > 0) {
            const actionsSection = document.createElement('div');
            actionsSection.className = 'mobile-table-card-actions';
            
            card.actionButtons.forEach(btn => {
                // Make buttons touch-friendly
                btn.style.minHeight = '44px';
                btn.style.padding = '10px 16px';
                btn.style.fontSize = '16px';
                
                // Check if it's a primary action (edit, view, etc.)
                if (btn.textContent.toLowerCase().includes('edit') || 
                    btn.textContent.toLowerCase().includes('view') ||
                    btn.querySelector('.fa-edit, .fa-eye, .fa-pencil')) {
                    btn.className += ' primary';
                }
                
                actionsSection.appendChild(btn);
            });
            
            card.appendChild(actionsSection);
        }
        
        return card;
    }
    
    // Convert a table to cards
    function convertTableToCards(table) {
        // Check if already converted
        if (table.dataset.mobileConverted === 'true') return;
        
        const wrapper = table.parentElement;
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        
        if (!tbody) return;
        
        // Get headers
        const headerRow = thead ? thead.querySelector('tr') : null;
        const headers = [];
        if (headerRow) {
            Array.from(headerRow.querySelectorAll('th, td')).forEach(th => {
                const text = th.textContent.trim();
                headers.push(text || '');
            });
        }
        
        // Create cards container
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'mobile-table-cards';
        
        // Convert each row
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            // Skip empty rows or header rows
            if (!tr.querySelector('td') || tr.classList.contains('hidden')) return;
            
            const card = rowToCard(tr, headers);
            if (card) {
                cardsContainer.appendChild(card);
            }
        });
        
        // Insert cards container before table
        if (cardsContainer.children.length > 0) {
            table.parentNode.insertBefore(cardsContainer, table);
            table.dataset.mobileConverted = 'true';
        }
    }
    
    // Convert all tables on page
    function convertAllTables() {
        if (!isMobile()) return;
        
        const tables = document.querySelectorAll('table:not([data-mobile-converted="true"])');
        tables.forEach(table => {
            // Check if it's a small table in a modal
            const headerCount = table.querySelectorAll('thead th, thead td').length;
            const isInModal = table.closest('[role="dialog"], .modal, [class*="modal"]');
            
            // Small tables (3 or fewer columns) - mark to keep visible
            if (headerCount <= 3 && isInModal) {
                table.setAttribute('data-keep-visible', 'true');
                return; // Don't convert these
            }
            
            // Convert larger tables or tables outside modals
            convertTableToCards(table);
        });
    }
    
    // Remove cards when switching back to desktop
    function removeCardConversions() {
        const cardsContainers = document.querySelectorAll('.mobile-table-cards');
        cardsContainers.forEach(container => container.remove());
        
        const tables = document.querySelectorAll('table[data-mobile-converted="true"]');
        tables.forEach(table => {
            delete table.dataset.mobileConverted;
        });
    }
    
    // Initialize on load
    function init() {
        if (isMobile()) {
            // Wait a bit for DOM to be ready
            setTimeout(convertAllTables, 100);
            setTimeout(convertAllTables, 500);
            setTimeout(convertAllTables, 1000);
        }
        
        // Watch for window resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (isMobile()) {
                    convertAllTables();
                } else {
                    removeCardConversions();
                }
            }, 250);
        });
        
        // Watch for new tables added dynamically
        const observer = new MutationObserver(() => {
            if (isMobile()) {
                convertAllTables();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    // Export to window
    window.mobileTableConverter = {
        convert: convertAllTables,
        convertTable: convertTableToCards,
        remove: removeCardConversions,
        init: init,
        isMobile: isMobile
    };
    
    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
