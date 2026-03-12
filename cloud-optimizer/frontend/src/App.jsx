import React, { useState, useEffect } from 'react';
import LiveMonitor from './components/LiveMonitor';
import AnomalyPanel from './components/AnomalyPanel';
import CostPanel from './components/CostPanel';
import PipelinePanel from './components/PipelinePanel';
import Navbar from './components/Navbar';

const TABS = [
  { id: 'live',     label: 'Live Monitor',   icon: '◉' },
  { id: 'anomaly',  label: 'Anomaly Filter',  icon: '⬡' },
  { id: 'cost',     label: 'Cost Optimizer',  icon: '▲' },
  { id: 'pipeline', label: 'ML Pipeline',     icon: '⬢' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('live');
  const [apiStatus, setApiStatus] = useState('checking');
  
  // Initialize theme from system preference
  const [theme, setTheme] = useState(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const checkApi = async () => {
      try {
        const r = await fetch('/api/health');
        const d = await r.json();
        setApiStatus(d.database === 'ok' ? 'online' : 'error');
      } catch (err) {
        setApiStatus('offline');
      }
    };
    checkApi();

    // Listen for system theme changes
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onThemeChange = (e) => setTheme(e.matches ? 'dark' : 'light');
    matcher.addEventListener('change', onThemeChange);
    return () => matcher.removeEventListener('change', onThemeChange);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={`theme-${theme}`} style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      background: 'var(--bg-main)', 
      color: 'var(--text-primary)', 
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
    }}>
      <Navbar 
        theme={theme} 
        toggleTheme={toggleTheme} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        TABS={TABS} 
        apiStatus={apiStatus} 
      />

      <main style={{ 
        flex: 1, 
        padding: '32px 40px', 
        maxWidth: '1600px', 
        width: '100%', 
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '32px'
      }}>
        <div key={activeTab} className="animate-fadeIn">
          {activeTab === 'live'     && <LiveMonitor />}
          {activeTab === 'anomaly'  && <AnomalyPanel />}
          {activeTab === 'cost'     && <CostPanel />}
          {activeTab === 'pipeline' && <PipelinePanel />}
        </div>
      </main>

      <footer style={{
        padding: '32px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid var(--border-dim)',
        background: 'var(--bg-main)'
      }}>
        <div className="meta-text" style={{ display: 'flex', gap: '24px' }}>
          <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>CLOUDPULSE PLATFORM</span>
          <span>SYSTEM VERSION 2.5.0-BETA</span>
        </div>
        <div className="meta-text" style={{ display: 'flex', gap: '24px' }}>
          <span>© 2026 CLOUDPULSE INTELLIGENCE</span>
          <span style={{ color: 'var(--brand-primary)', fontWeight: '700' }}>CONNECTED TO LAYER 2</span>
        </div>
      </footer>
    </div>
  );
}