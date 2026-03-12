import React from 'react';

export default function StatCard({ label, value, subValue, icon, color, trend }) {
  return (
    <div className="premium-card" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '12px',
      borderLeft: `4px solid ${color || 'var(--brand-primary)'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title" style={{ 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em' 
        }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: '20px', color: color || 'var(--brand-primary)' }}>{icon}</span>}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span className="stat-number">
          {value}
        </span>
        {trend && (
          <span className="meta-text" style={{ 
            fontWeight: '700', 
            color: trend > 0 ? 'var(--status-err)' : 'var(--status-ok)',
            background: trend > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      
      {subValue && (
        <div className="meta-text" style={{ 
          textTransform: 'uppercase',
          letterSpacing: '0.03em'
        }}>
          {subValue}
        </div>
      )}
    </div>
  );
}
