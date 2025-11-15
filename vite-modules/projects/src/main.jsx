import React, { ReactDOM } from './react-window.js';
import ProjectsModule, { Projects, ProjectDetail, ProjectModal, MonthlyDocumentCollectionTracker } from './ProjectsModule';
import '../../../src/styles/main.css';  // Use existing Tailwind

// CRITICAL: Only expose MonthlyDocumentCollectionTracker to avoid conflicts with newer components
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
  
  // DO NOT expose old Projects components - they conflict with newer versions
  // Only expose if they don't exist (fallback for edge cases)
  if (!window.Projects || typeof window.Projects !== 'function') {
    console.warn('⚠️ Vite module: Old Projects component detected as missing, but not exposing to avoid conflicts');
    // window.Projects = Projects; // COMMENTED OUT - causes conflicts
  }
  if (!window.ProjectDetail || typeof window.ProjectDetail !== 'function') {
    console.warn('⚠️ Vite module: Old ProjectDetail component detected as missing, but not exposing to avoid conflicts');
    // window.ProjectDetail = ProjectDetail; // COMMENTED OUT - causes conflicts
  }
  if (!window.ProjectModal || typeof window.ProjectModal !== 'function') {
    console.warn('⚠️ Vite module: Old ProjectModal component detected as missing, but not exposing to avoid conflicts');
    // window.ProjectModal = ProjectModal; // COMMENTED OUT - causes conflicts
  }
  
  window.ViteProjects = ProjectsModule;
  
  // Dispatch event to notify that MonthlyDocumentCollectionTracker is ready
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('viteProjectsReady', {
      detail: { 
        // Only include MonthlyDocumentCollectionTracker in event
        MonthlyDocumentCollectionTracker: window.MonthlyDocumentCollectionTracker 
      }
    }));
    console.log('📢 Dispatched viteProjectsReady event (MonthlyDocumentCollectionTracker only)');
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
