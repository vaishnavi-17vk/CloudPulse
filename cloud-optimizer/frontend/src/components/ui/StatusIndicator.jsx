import React from 'react';

export default function StatusIndicator({ status }) {
  const colors = {
    online: 'var(--status-ok)',
    offline: 'var(--status-err)',
    checking: 'var(--status-warn)',
    error: 'var(--status-err)'
  };
  
  const color = colors[status] || colors.checking;

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '10px', 
      fontSize: '11px', 
      fontWeight: '600', 
      color: 'var(--text-dim)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }}>
      <span className="status-indicator" style={{ background: color }} />
      <span>API {status}</span>
    </div>
  );
}
