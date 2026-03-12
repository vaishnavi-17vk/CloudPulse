import React, { useState, useEffect } from 'react';
import LiveMonitor from './components/LiveMonitor';
import AnomalyPanel from './components/AnomalyPanel';
import CostPanel from './components/CostPanel';
import PipelinePanel from './components/PipelinePanel';
import Logo from './components/Logo';

const TABS = [
  { id: 'live',     label: 'Live Monitor',   icon: '◉' },
  { id: 'anomaly',  label: 'Anomaly Filter',  icon: '⬡' },
  { id: 'cost',     label: 'Cost Optimizer',  icon: '▲' },
  { id: 'pipeline', label: 'ML Pipeline',     icon: '⬢' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('live');
  const [apiStatus, setApiStatus] = useState('checking');
  
  // Initialize from system preference
  const [theme, setTheme] = useState(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setApiStatus(d.database === 'ok' ? 'online' : 'error'))
      .catch(() => setApiStatus('offline'));

    // Listen for system theme changes
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onThemeChange = (e) => setTheme(e.matches ? 'dark' : 'light');
    matcher.addEventListener('change', onThemeChange);
    return () => matcher.removeEventListener('change', onThemeChange);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const statusColor = { online: 'var(--status-ok)', offline: 'var(--status-err)', checking: 'var(--status-warn)', error: 'var(--status-err)' };

  return (
    <div className={`theme-${theme}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', color: 'var(--text-main)', transition: 'all 0.3s' }}>
      <header className="glass" style={{
        height: '100px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 40px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderBottom: '1px solid var(--border-dim)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Logo theme={theme} style={{ width: '86px' }} />
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: '800', 
            color: 'var(--text-main)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            fontFamily: 'Outfit, sans-serif'
          }}>
            Cloud<span style={{ color: 'var(--brand-primary)' }}>Pulse</span>
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <button 
            onClick={toggleTheme}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-dim)',
              color: 'var(--text-main)',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'Outfit'
            }}
          >
            {theme === 'dark' ? '☀️ LIGHT MODE' : '🌙 DARK MODE'}
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-dim)', fontWeight: '500' }}>
            <span className="status-indicator" style={{ background: statusColor[apiStatus], boxShadow: `0 0 10px ${statusColor[apiStatus]}` }} />
            API {apiStatus.toUpperCase()}
          </div>
        </div>
      </header>

      <div style={{
        background: 'var(--bg-main)',
        padding: '12px 40px 0 40px',
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        gap: '4px',
        transition: 'all 0.3s'
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--brand-primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--text-main)' : 'var(--text-muted)',
              fontFamily: "'Outfit', sans-serif",
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <span style={{ color: activeTab === tab.id ? 'var(--brand-primary)' : 'inherit', fontSize: '14px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <main style={{ flex: 1, padding: '40px', maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
        <div key={activeTab} className="animate-fadeIn">
          {activeTab === 'live'     && <LiveMonitor />}
          {activeTab === 'anomaly'  && <AnomalyPanel />}
          {activeTab === 'cost'     && <CostPanel />}
          {activeTab === 'pipeline' && <PipelinePanel />}
        </div>
      </main>

      <footer className="glass" style={{
        padding: '16px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: 'var(--text-muted)',
        fontFamily: "'Space Mono', monospace",
        borderTop: '1px solid var(--border-dim)'
      }}>
        <span>CLOUDPULSE PLATFORM</span>
        <span>© 2026 CLOUDPULSE</span>
      </footer>
    </div>
  );
}