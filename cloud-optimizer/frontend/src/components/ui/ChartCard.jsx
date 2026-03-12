import React from 'react';

export default function ChartCard({ title, children, headerRight, height = '350px' }) {
  return (
    <div className="premium-card" style={{ padding: '24px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px' 
      }}>
        <h3 className="card-title" style={{ 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em' 
        }}>
          {title}
        </h3>
        {headerRight && <div>{headerRight}</div>}
      </div>
      
      <div style={{ height, width: '100%', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}
