import React from 'react';
import ReactDOM from 'react-dom/client';
import ProjectsModule from './ProjectsModule';
import '../../../src/styles/main.css';  // Use existing Tailwind

// Mount the Projects module
const container = document.getElementById('vite-projects-root');
if (container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <ProjectsModule />
    </React.StrictMode>
  );
}

// Also expose to window for backwards compatibility with old system
window.ViteProjects = ProjectsModule;
console.log('✅ Vite Projects module loaded');
