// JobCards shell component
// This is a lightweight wrapper that gets registered on window
// so that Service & Maintenance can render it while the full
// Job Cards experience is being iterated on.

const JobCards = (props) => {
  // For now, render nothing – the Service & Maintenance page
  // will still show its new header and mobile form card,
  // and this placeholder avoids blocking the loading state.
  return null;
};

// Make available globally for `ServiceAndMaintenance.jsx`
try {
  window.JobCards = JobCards;
  window.dispatchEvent(new Event('jobcardsComponentReady'));
  console.log('✅ JobCards.jsx loaded and registered');
} catch (error) {
  console.error('❌ JobCards.jsx: Error registering global component:', error);
}

export default JobCards;
