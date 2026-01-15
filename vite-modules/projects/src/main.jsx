import React, { ReactDOM } from './react-window.js';
import ProjectsModule, { Projects, ProjectDetail, ProjectModal, MonthlyDocumentCollectionTracker } from './ProjectsModule';
import '../../../src/styles/main.css';  // Use existing Tailwind

// CRITICAL: Only expose MonthlyDocumentCollectionTracker to avoid conflicts with newer components
// The old Projects, ProjectDetail, and ProjectModal should NOT be exposed as they conflict
// with the newer versions in src/components/projects/
// WeeklyFMSReviewTracker is loaded from src/components/projects/ separately
if (typeof window !== 'undefined') {
  // Only expose MonthlyDocumentCollectionTracker if it's not already available
  // This prevents the old Vite module from overwriting newer components
  if (!window.MonthlyDocumentCollectionTracker || typeof window.MonthlyDocumentCollectionTracker !== 'function') {
    window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
    console.log('✅ Vite module: MonthlyDocumentCollectionTracker exposed to window');
  } else {
    console.log('✅ Vite module: MonthlyDocumentCollectionTracker already available from main source, skipping');
  }
  
  // WeeklyFMSReviewTracker is loaded from src/components/projects/WeeklyFMSReviewTracker.jsx separately
  // Don't expose it here to avoid conflicts
  
  // DO NOT expose old Projects components - they conflict with newer versions
  // Only expose if they don't exist (fallback for edge cases)
  // Use debug-level logging to reduce console noise (these are expected and intentional)
  if (!window.Projects || typeof window.Projects !== 'function') {
    // Silently skip - this is expected behavior
  }
  if (!window.ProjectDetail || typeof window.ProjectDetail !== 'function') {
    // Silently skip - this is expected behavior
  }
  if (!window.ProjectModal || typeof window.ProjectModal !== 'function') {
    // Silently skip - this is expected behavior
  }
  
  window.ViteProjects = ProjectsModule;
  
  // Dispatch event to notify that MonthlyDocumentCollectionTracker is ready
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('viteProjectsReady', {
      detail: { 
        MonthlyDocumentCollectionTracker: window.MonthlyDocumentCollectionTracker
      }
    }));
    console.log('📢 Dispatched viteProjectsReady event (MonthlyDocumentCollectionTracker)');
  }
}

// Mount the Projects module (optional - for standalone testing)
const container = document.getElementById('vite-projects-root');
if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ProjectsModule />
    </React.StrictMode>
  );
}
