import React from 'react';

export default function LoadingSpinner({ message = 'Loading page', overlay = false }) {
  return <div className={`gv-loading${overlay ? ' gv-loading-screen' : ''}`} role="status" aria-live="polite">
    <span className="gv-loading-spinner" aria-hidden="true"><i /><i /><i /></span>
    <span>{message}</span>
  </div>;
}
