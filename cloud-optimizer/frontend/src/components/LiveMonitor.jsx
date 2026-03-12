import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const COMPONENTS = [
  { key: 'paas_payment',  label: 'PaaS Payment',  resources: ['acu', 'ram'],     color: '#f97316', icon: '⬢' },
  { key: 'iaas_webpage',  label: 'IaaS Webpage',  resources: ['acu', 'iops'],    color: '#10b981', icon: '◈' },
  { key: 'saas_database', label: 'SaaS Database', resources: ['dtu', 'storage'], color: '#3b82f6', icon: '◉' },
];

const RESOURCE_LABELS = { acu: 'ACU', ram: 'RAM%', iops: 'IOPS%', dtu: 'DTU', storage: 'Storage%' };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-dim)', padding: '12px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
      <div style={{ fontFamily: 'Space Mono', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--border-dim)', paddingBottom: '4px' }}>T-{label}TICK</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontFamily: 'Outfit', fontSize: '11px', color: 'var(--text-dim)' }}>{RESOURCE_LABELS[p.dataKey] || p.dataKey}</span>
          <span style={{ fontFamily: 'Space Mono', fontSize: '12px', fontWeight: '700', color: p.color }}>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Live Resource Monitor</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
            <span className="status-indicator glow-green" style={{ background: 'var(--brand-secondary)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'Space Mono' }}>
              REAL-TIME POLLING: 5.0S · SYNC: {lastUpdate}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
            <div className="premium-card glass" style={{ padding: '12px 24px', textAlign: 'right', minWidth: '140px' }}>
               <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Avg Utilization</div>
               <div style={{ fontSize: '24px', fontWeight: '800', color: avgUtil > 70 ? 'var(--status-err)' : avgUtil > 50 ? 'var(--status-warn)' : 'var(--brand-secondary)' }}>{avgUtil}%</div>
            </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {COMPONENTS.map(({ key, label, resources, color, icon }) => {
          const compData = data?.components?.[key] ?? {};
          const hist = history[key] ?? [];
          const [r1, r2] = resources;
          const v1 = compData[r1] ?? 0;
          const v2 = compData[r2] ?? 0;

          return (
            <div key={key} className="premium-card animate-fadeIn" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: `${color}05`, borderRadius: '50%', filter: 'blur(30px)' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: color }}>
                  <span style={{ fontSize: '18px' }}>{icon}</span>
                  <span style={{ fontFamily: 'Outfit', fontWeight: '700', fontSize: '15px', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                </div>
                <span style={{ fontSize: '9px', fontWeight: '800', padding: '3px 8px', borderRadius: '4px', background: `${color}15`, color, border: `1px solid ${color}30` }}>LIVE</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                {[{ res: r1, val: v1 }, { res: r2, val: v2 }].map(({ res, val }) => (
                  <div key={res}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', fontFamily: 'Space Mono' }}>{RESOURCE_LABELS[res]}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-main)', fontFamily: 'Space Mono' }}>{val.toFixed(0)}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Mono' }}>%</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--bg-main)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, val)}%`, background: val > 80 ? 'var(--status-err)' : color, borderRadius: '2px', transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', fontFamily: 'Space Mono', letterSpacing: '0.05em' }}>30-POINT HISTORY</div>
              <div style={{ height: '120px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hist}>
                    <CartesianGrid strokeDasharray="3 6" stroke="var(--border-dim)" vertical={false} opacity={0.3} />
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey={r1} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey={r2} stroke={`${color}40`} strokeWidth={1} dot={false} isAnimationActive={false} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[
          { label: 'Ingested Telemetry',    value: '8.6k',  color: 'var(--brand-accent)' },
          { label: 'Anomalies Identified',  value: '248',    color: 'var(--status-warn)' },
          { label: 'Active ML Models',      value: '4',      color: 'var(--brand-purple)' },
          { label: 'System Uptime',         value: '99.9%',  color: 'var(--brand-secondary)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="premium-card glass" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
              <div style={{ fontSize: '20px', fontWeight: '800', marginTop: '4px', color: 'var(--text-main)' }}>{value}</div>
            </div>
            <div style={{ width: '4px', height: '24px', background: color, borderRadius: '2px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}