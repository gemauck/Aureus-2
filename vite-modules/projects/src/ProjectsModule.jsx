import React from './react-window.js';
import Projects from './components/Projects';
import ProjectDetail from './components/ProjectDetail';
import ProjectModal from './components/ProjectModal';
import MonthlyDocumentCollectionTracker from './components/MonthlyDocumentCollectionTracker';

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
export { Projects, ProjectDetail, ProjectModal, MonthlyDocumentCollectionTracker };

// Also expose to window for backwards compatibility
if (typeof window !== 'undefined') {
  window.Projects = Projects;
  window.ProjectDetail = ProjectDetail;
  window.ProjectModal = ProjectModal;
  window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
  console.log('✅ Projects module components exposed to window');
}

export default ProjectsModule;
