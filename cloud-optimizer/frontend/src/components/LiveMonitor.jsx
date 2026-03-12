import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import StatCard from './ui/StatCard';

const COMPONENTS = [
  { key: 'paas_payment',  label: 'PaaS Payment',  resources: ['acu', 'ram'],     color: '#22c55e', icon: '⬢' },
  { key: 'iaas_webpage',  label: 'IaaS Webpage',  resources: ['acu', 'iops'],    color: '#3b82f6', icon: '◈' },
  { key: 'saas_database', label: 'SaaS Database', resources: ['dtu', 'storage'], color: '#f97316', icon: '◉' },
];

const RESOURCE_LABELS = { acu: 'ACU', ram: 'RAM%', iops: 'IOPS%', dtu: 'DTU', storage: 'Storage%' };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ 
      background: 'var(--glass-bg)', 
      backdropFilter: 'blur(8px)', 
      border: '1px solid var(--border-dim)', 
      padding: '12px', 
      borderRadius: '8px', 
      boxShadow: 'var(--shadow-md)',
      minWidth: '140px'
    }}>
      <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '4px' }}>T-{label}TICK</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'center', marginBottom: '4px' }}>
          <span className="body-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{RESOURCE_LABELS[p.dataKey] || p.dataKey}</span>
          <span className="mono" style={{ fontSize: '13px', fontWeight: '700', color: p.color }}>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function LiveMonitor() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState({});
  const [tick, setTick] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('--:--:--');
  const tickRef = useRef(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/live-metrics');
        const json = await res.json();
        setData(json);
        setLastUpdate(new Date().toLocaleTimeString());
        tickRef.current += 1;
        const t = tickRef.current;
        setTick(t);

        setHistory(prev => {
          const next = { ...prev };
          for (const [comp, resources] of Object.entries(json.components)) {
            if (!next[comp]) next[comp] = [];
            next[comp] = [...next[comp].slice(-29), { t, ...resources }];
          }
          return next;
        });
      } catch (e) {
        console.error('Live metrics error:', e);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const avgUtil = data?.summary?.avg_utilization ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Top Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">Live Resource Monitor</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <span className="meta-text" style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ color: 'var(--brand-primary)' }}>●</span> REAL-TIME POLLING: 5.0S · SYNC: {lastUpdate}
            </span>
          </div>
        </div>
      </div>

      {/* Grid for Components */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {COMPONENTS.map(({ key, label, resources, color, icon }) => {
          const compData = data?.components?.[key] ?? {};
          const hist = history[key] ?? [];
          const [r1, r2] = resources;
          const v1 = compData[r1] ?? 0;
          const v2 = compData[r2] ?? 0;

          return (
            <div key={key} className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', color }}>{icon}</span>
                  <span className="card-title" style={{ color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                </div>
                <div className="meta-text" style={{ 
                  fontWeight: '800', 
                  padding: '4px 8px', 
                  borderRadius: '12px', 
                  background: `${color}15`, 
                  color, 
                  border: `1px solid ${color}30`,
                  fontSize: '11px'
                }}>LIVE</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {[{ res: r1, val: v1 }, { res: r2, val: v2 }].map(({ res, val }) => (
                  <div key={res}>
                    <div className="meta-text" style={{ marginBottom: '8px', fontWeight: '700' }}>{RESOURCE_LABELS[res]}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span className="stat-number" style={{ fontSize: '28px' }}>{val.toFixed(0)}</span>
                      <span className="meta-text" style={{ fontWeight: '600' }}>%</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--border-dim)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${Math.min(100, val)}%`, 
                        background: val > 80 ? 'var(--status-err)' : color, 
                        borderRadius: '3px', 
                        transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' 
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="meta-text" style={{ marginBottom: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trend History (30 ticks)</div>
                <div style={{ height: '100px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hist}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} opacity={0.4} />
                      <XAxis dataKey="t" hide />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey={r1} stroke={color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey={r2} stroke={`${color}40`} strokeWidth={1.5} dot={false} isAnimationActive={false} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
        <StatCard 
          label="Avg Utilization" 
          value={`${avgUtil}%`} 
          subValue="Cross-platform workload"
          color={avgUtil > 70 ? 'var(--status-err)' : 'var(--brand-primary)'}
          icon="⚡"
        />
        <StatCard 
          label="Telemetry Stream" 
          value="8.6k" 
          subValue="Active data buffer"
          color="var(--brand-accent)"
          icon="📡"
        />
        <StatCard 
          label="AI Logic Units" 
          value="4" 
          subValue="Parallel ML pipelines"
          color="var(--brand-purple)"
          icon="🧠"
        />
        <StatCard 
          label="Uptime Efficiency" 
          value="99.9%" 
          subValue="System availability"
          color="var(--brand-primary)"
          icon="✅"
        />
      </div>
    </div>
  );
}