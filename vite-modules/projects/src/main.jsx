import React, { ReactDOM } from './react-window.js';
import ProjectsModule, { Projects, ProjectDetail, ProjectModal, MonthlyDocumentCollectionTracker, WeeklyFMSReviewTracker } from './ProjectsModule';
import '../../../src/styles/main.css';  // Use existing Tailwind

// CRITICAL: Only expose MonthlyDocumentCollectionTracker and WeeklyFMSReviewTracker to avoid conflicts with newer components
// The old Projects, ProjectDetail, and ProjectModal should NOT be exposed as they conflict
// with the newer versions in src/components/projects/
if (typeof window !== 'undefined') {
  // Only expose MonthlyDocumentCollectionTracker if it's not already available
  // This prevents the old Vite module from overwriting newer components
  if (!window.MonthlyDocumentCollectionTracker || typeof window.MonthlyDocumentCollectionTracker !== 'function') {
    window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
    console.log('✅ Vite module: MonthlyDocumentCollectionTracker exposed to window');
  } else {
    console.log('✅ Vite module: MonthlyDocumentCollectionTracker already available from main source, skipping');
  }
  
  // Expose WeeklyFMSReviewTracker
  if (!window.WeeklyFMSReviewTracker || typeof window.WeeklyFMSReviewTracker !== 'function') {
    window.WeeklyFMSReviewTracker = WeeklyFMSReviewTracker;
    console.log('✅ Vite module: WeeklyFMSReviewTracker exposed to window');
  } else {
    console.log('✅ Vite module: WeeklyFMSReviewTracker already available from main source, skipping');
  }
  
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
  
  // Dispatch event to notify that MonthlyDocumentCollectionTracker and WeeklyFMSReviewTracker are ready
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('viteProjectsReady', {
      detail: { 
        MonthlyDocumentCollectionTracker: window.MonthlyDocumentCollectionTracker,
        WeeklyFMSReviewTracker: window.WeeklyFMSReviewTracker
      }
    }));
    console.log('📢 Dispatched viteProjectsReady event (MonthlyDocumentCollectionTracker and WeeklyFMSReviewTracker)');
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
