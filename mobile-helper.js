/**
 * ABCOTRONICS ERP - MOBILE HELPER
 * JavaScript utilities for mobile responsiveness
 */

(function() {
  'use strict';
  
  // ===== MOBILE DETECTION =====
  const isMobile = () => window.innerWidth <= 1024;
  const isSmallMobile = () => window.innerWidth <= 640;
  
  // ===== SIDEBAR TOGGLE =====
  function initSidebar() {
    const sidebar = document.querySelector('aside');
    const hamburger = document.querySelector('button[aria-label*="menu"], button[aria-label*="Menu"]');
    
    if (!sidebar || !hamburger) return;
    
    // Toggle sidebar
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebar.classList.contains('sidebar-open');
      
      if (isOpen) {
        sidebar.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-open');
      } else {
        sidebar.classList.add('sidebar-open');
        document.body.classList.add('sidebar-open');
      }
    });
    
    // Close sidebar when clicking outside (on overlay)
    document.body.addEventListener('click', (e) => {
      if (!isMobile()) return;
      
      const isOpen = sidebar.classList.contains('sidebar-open');
      if (!isOpen) return;
      
      // Check if click is outside sidebar and hamburger
      if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
        sidebar.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-open');
      }
    });
    
    // Close sidebar on menu item click (mobile only)
    sidebar.querySelectorAll('button, a').forEach(item => {
      item.addEventListener('click', () => {
        if (isMobile()) {
          sidebar.classList.remove('sidebar-open');
          document.body.classList.remove('sidebar-open');
        }
      });
    });
    
    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!isMobile()) {
          // Close sidebar and remove body class on desktop
          sidebar.classList.remove('sidebar-open');
          document.body.classList.remove('sidebar-open');
        }
      }, 250);
    });
  }
  
  // ===== TABLE TO CARD CONVERSION =====
  function convertTablesToCards() {
    if (!isMobile()) return;
    
    const tables = document.querySelectorAll('table:not([data-keep-table])');
    
    tables.forEach(table => {
      // Check if already converted
      const nextSibling = table.nextElementSibling;
      if (nextSibling && nextSibling.classList.contains('mobile-cards')) return;
      
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      
      if (rows.length === 0) return;
      
      // Create cards container
      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'mobile-cards';
      
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const card = document.createElement('div');
        card.className = 'mobile-card';
        
        cells.forEach((cell, index) => {
          if (headers[index]) {
            const item = document.createElement('div');
            item.className = 'flex justify-between items-center mb-2';
            item.innerHTML = `
              <span class="font-medium text-gray-600 dark:text-gray-400">${headers[index]}:</span>
              <span class="text-gray-900 dark:text-white">${cell.innerHTML}</span>
            `;
            card.appendChild(item);
          }
        });
        
        // Copy data attributes
        Array.from(row.attributes).forEach(attr => {
          if (attr.name.startsWith('data-')) {
            card.setAttribute(attr.name, attr.value);
          }
        });
        
        // Copy click handlers
        if (row.onclick) {
          card.onclick = row.onclick;
          card.style.cursor = 'pointer';
        }
        
        cardsContainer.appendChild(card);
      });
      
      // Hide table and insert cards
      table.style.display = 'none';
      table.parentNode.insertBefore(cardsContainer, table.nextSibling);
    });
  }
  
  // ===== FORM ENHANCEMENTS =====
  function enhanceForms() {
    // Add touch feedback to all form inputs
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        input.parentElement?.classList.add('input-focused');
      });
      input.addEventListener('blur', () => {
        input.parentElement?.classList.remove('input-focused');
      });
    });
    
    // Handle iOS zoom prevention
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        if (input.style.fontSize && parseFloat(input.style.fontSize) < 16) {
          input.style.fontSize = '16px';
        }
      });
    }
  }
  
  // ===== MODAL ENHANCEMENTS =====
  function enhanceModals() {
    if (!isMobile()) return;
    
    // Make all modals fullscreen
    const modals = document.querySelectorAll('[role="dialog"], .modal');
    modals.forEach(modal => {
      modal.style.position = 'fixed';
      modal.style.inset = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.maxWidth = '100vw';
      modal.style.maxHeight = '100vh';
      modal.style.margin = '0';
      modal.style.borderRadius = '0';
    });
    
    // Prevent body scroll when modal is open
    const observer = new MutationObserver(() => {
      const hasOpenModal = document.querySelector('[role="dialog"]:not([style*="display: none"]), .modal:not([style*="display: none"])');
      if (hasOpenModal) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
  }
  
  // ===== TOUCH FEEDBACK =====
  function addTouchFeedback() {
    document.body.addEventListener('touchstart', (e) => {
      const target = e.target.closest('button, a[role="button"], .btn');
      if (target) {
        target.classList.add('touch-active');
      }
    }, { passive: true });
    
    document.body.addEventListener('touchend', (e) => {
      const target = e.target.closest('button, a[role="button"], .btn');
      if (target) {
        setTimeout(() => {
          target.classList.remove('touch-active');
        }, 150);
      }
    }, { passive: true });
  }
  
  // ===== VIEWPORT HEIGHT FIX (for iOS Safari) =====
  function fixViewportHeight() {
    // Set CSS custom property for accurate vh on mobile
    function setVH() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => {
      setTimeout(setVH, 100);
    });
  }
  
  // ===== SCROLL POSITION RESTORATION =====
  function handleScrollRestoration() {
    // Save scroll position when navigating away
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('scrollPos', window.scrollY);
    });
    
    // Restore scroll position on load
    window.addEventListener('load', () => {
      const scrollPos = sessionStorage.getItem('scrollPos');
      if (scrollPos) {
        window.scrollTo(0, parseInt(scrollPos));
        sessionStorage.removeItem('scrollPos');
      }
    });
  }
  
  // ===== ORIENTATION CHANGE HANDLER =====
  function handleOrientationChange() {
    let previousOrientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    
    window.addEventListener('resize', () => {
      const currentOrientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
      
      if (currentOrientation !== previousOrientation) {
        previousOrientation = currentOrientation;
        
        // Trigger reflow on orientation change
        document.body.style.display = 'none';
        document.body.offsetHeight; // Force reflow
        document.body.style.display = '';
        
        // Re-convert tables if needed
        setTimeout(() => {
          document.querySelectorAll('.mobile-cards').forEach(el => el.remove());
          convertTablesToCards();
        }, 100);
      }
    });
  }
  
  // ===== INFINITE SCROLL HELPER =====
  function enableInfiniteScroll(containerSelector, loadMoreCallback) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadMoreCallback();
        }
      });
    }, {
      rootMargin: '100px'
    });
    
    // Observe a sentinel element at the bottom
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    container.appendChild(sentinel);
    observer.observe(sentinel);
  }
  
  // ===== INITIALIZE EVERYTHING =====
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    console.log('📱 Initializing mobile helpers...');
    
    // Core functions
    initSidebar();
    fixViewportHeight();
    addTouchFeedback();
    enhanceForms();
    handleScrollRestoration();
    handleOrientationChange();
    
    // Run on initial load
    if (isMobile()) {
      convertTablesToCards();
      enhanceModals();
    }
    
    // Re-run on dynamic content changes
    const contentObserver = new MutationObserver(() => {
      if (isMobile()) {
        convertTablesToCards();
        enhanceModals();
        enhanceForms();
      }
    });
    
    contentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Expose utility functions globally
    window.mobileHelper = {
      isMobile,
      isSmallMobile,
      convertTablesToCards,
      enableInfiniteScroll
    };
    
    console.log('✅ Mobile helpers initialized');
  }
  
  // Start initialization
  init();
  
})();
