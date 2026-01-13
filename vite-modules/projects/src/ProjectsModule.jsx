import React from './react-window.js';
import Projects from './components/Projects';
import ProjectDetail from './components/ProjectDetail';
import ProjectModal from './components/ProjectModal';
import MonthlyDocumentCollectionTracker from './components/MonthlyDocumentCollectionTracker';
import WeeklyFMSReviewTracker from './components/WeeklyFMSReviewTracker';
import MonthlyFMSReviewTracker from './components/MonthlyFMSReviewTracker';
// Import API service to ensure it's included in the build and registers on window
import './services/documentCollectionAPI.js';

// ProjectsModule - Main entry point for the Projects Vite module
// This wraps the Projects component and provides integration with the main app
const ProjectsModule = () => {
  // For now, we'll render Projects directly
  // In the future, this can handle routing, state management, etc.
  return (
    <div className="projects-module">
      <Projects />
    </div>
  );
};

// Export components for use in other modules
export { Projects, ProjectDetail, ProjectModal, MonthlyDocumentCollectionTracker, WeeklyFMSReviewTracker, MonthlyFMSReviewTracker };

// Also expose to window for backwards compatibility
// NOTE: MonthlyDocumentCollectionTracker, WeeklyFMSReviewTracker, and MonthlyFMSReviewTracker should be exposed here
// The old Projects, ProjectDetail, and ProjectModal should NOT be exposed
// as they conflict with newer versions in src/components/projects/
if (typeof window !== 'undefined') {
  // Only expose MonthlyDocumentCollectionTracker if not already available
  if (!window.MonthlyDocumentCollectionTracker || typeof window.MonthlyDocumentCollectionTracker !== 'function') {
    window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
    console.log('✅ ProjectsModule: MonthlyDocumentCollectionTracker exposed to window');
  }
  
  // Expose WeeklyFMSReviewTracker - ALWAYS override to ensure latest version
  window.WeeklyFMSReviewTracker = WeeklyFMSReviewTracker;
  console.log('✅ ProjectsModule: WeeklyFMSReviewTracker exposed to window (overriding any existing version)');
  
  // Expose MonthlyFMSReviewTracker - ALWAYS override to ensure latest version
  window.MonthlyFMSReviewTracker = MonthlyFMSReviewTracker;
  console.log('✅ ProjectsModule: MonthlyFMSReviewTracker exposed to window (overriding any existing version)');
  
  // DO NOT expose old Projects components - they will conflict with newer versions
  // These are commented out to prevent the old version from loading
  // window.Projects = Projects; // COMMENTED OUT - conflicts with src/components/projects/Projects.jsx
  // window.ProjectDetail = ProjectDetail; // COMMENTED OUT - conflicts with src/components/projects/ProjectDetail.jsx
  // window.ProjectModal = ProjectModal; // COMMENTED OUT - conflicts with src/components/projects/ProjectModal.jsx
}

export default ProjectsModule;
