import React, { useState, useEffect } from 'react';
import darkLogo from '../assets/dark-logo.png';
import lightLogo from '../assets/light-logo.png';

export default function Logo({ theme, className, style }) {
  // theme can be passed as a prop ('dark' | 'light')
  // but we also support system preference if theme is not provided
  const [isSystemDark, setIsSystemDark] = useState(
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setIsSystemDark(e.matches);
    
    matcher.addEventListener('change', onChange);
    return () => matcher.removeEventListener('change', onChange);
  }, []);

  // Determine which logo to use
  // If a theme prop is provided, honor it. Otherwise, use system preference.
  const activeTheme = theme || (isSystemDark ? 'dark' : 'light');
  const currentLogo = activeTheme === 'dark' ? darkLogo : lightLogo;

  return (
    <img
      src={currentLogo}
      alt="CloudPulse Logo"
      className={className}
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        maxWidth: '180px', // Default max width, can be overridden
        transition: 'all 0.3s ease',
        ...style
      }}
    />
  );
}
