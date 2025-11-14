import React from 'react';
import ReactDOM from 'react-dom/client';
import ProjectsModule, { Projects, ProjectDetail, ProjectModal, MonthlyDocumentCollectionTracker } from './ProjectsModule';
import '../../../src/styles/main.css';  // Use existing Tailwind

// CRITICAL: Expose components to window IMMEDIATELY for backwards compatibility
// This must happen before the old system tries to use them
if (typeof window !== 'undefined') {
  window.Projects = Projects;
  window.ProjectDetail = ProjectDetail;
  window.ProjectModal = ProjectModal;
  window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
  window.ViteProjects = ProjectsModule;
  
  console.log('✅ Vite Projects module components exposed to window');
  console.log('✅ Projects:', typeof Projects);
  console.log('✅ ProjectDetail:', typeof ProjectDetail);
  console.log('✅ ProjectModal:', typeof ProjectModal);
  console.log('✅ MonthlyDocumentCollectionTracker:', typeof MonthlyDocumentCollectionTracker);
  
  // Dispatch event to notify that Vite components are ready
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('viteProjectsReady', {
      detail: { 
        Projects, 
        ProjectDetail, 
        ProjectModal, 
        MonthlyDocumentCollectionTracker 
      }
    }));
    console.log('📢 Dispatched viteProjectsReady event');
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
