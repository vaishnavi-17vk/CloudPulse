import React from 'react';
import Logo from './Logo';
import ThemeToggle from './ui/ThemeToggle';
import StatusIndicator from './ui/StatusIndicator';

export default function Navbar({ theme, toggleTheme, activeTab, setActiveTab, TABS, apiStatus }) {
  return (
    <nav className="glass" style={{
      height: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 40px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      width: '100%'
    }}>
      {/* Left: Logo + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Logo theme={theme} style={{ width: '56px' }} />
        <h1 className="page-title" style={{ 
          fontSize: '24px', // Slightly smaller for navbar but still bold and Poppins
          textTransform: 'uppercase', 
          letterSpacing: '0.05em',
        }}>
          Cloud<span style={{ color: 'var(--brand-primary)' }}>Pulse</span>
        </h1>
      </div>

      {/* Center: Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        background: 'var(--input-bg)', 
        padding: '6px', 
        borderRadius: '32px',
        border: '1px solid var(--border-dim)'
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 24px',
              borderRadius: '24px',
              background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
              border: 'none',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: "'Inter', sans-serif",
              fontSize: '15px',
              fontWeight: '600',
              letterSpacing: '0.2px',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <span style={{ 
              color: activeTab === tab.id ? 'var(--brand-primary)' : 'inherit', 
              fontSize: '16px' 
            }}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
        {/* New AI Section - Coming Soon */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 24px',
          color: 'var(--text-muted)',
          opacity: 0.6,
          cursor: 'not-allowed',
          fontSize: '15px',
          fontWeight: '600',
          position: 'relative'
        }}>
          <span style={{ fontSize: '16px' }}>✨</span>
          AI
          <span style={{ 
            fontSize: '10px', 
            background: 'var(--brand-accent)', 
            color: '#fff', 
            padding: '2px 6px', 
            borderRadius: '6px', 
            marginLeft: '4px',
            letterSpacing: '0.05em',
            fontWeight: '800'
          }}>
            COMING SOON
          </span>
        </div>
      </div>

      {/* Right Side Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        <StatusIndicator status={apiStatus} />
      </div>
    </nav>
  );
}
