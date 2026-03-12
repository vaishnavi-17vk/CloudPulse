import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import StatCard from './ui/StatCard';
import ChartCard from './ui/ChartCard';

const CHANNELS = [
  { component: 'paas_payment',  resource: 'acu',     label: 'PaaS Payment / ACU',     color: '#f59e0b' },
  { component: 'paas_payment',  resource: 'ram',     label: 'PaaS Payment / RAM',     color: '#fbbf24' },
  { component: 'iaas_webpage',  resource: 'acu',     label: 'IaaS Webpage / ACU',     color: '#10b981' },
  { component: 'iaas_webpage',  resource: 'iops',    label: 'IaaS Webpage / IOPS',    color: '#34d399' },
  { component: 'saas_database', resource: 'dtu',     label: 'SaaS Database / DTU',    color: '#6366f1' },
  { component: 'saas_database', resource: 'storage', label: 'SaaS Database / Storage', color: '#818cf8' },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ 
      background: 'var(--glass-bg)', 
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--border-dim)', 
      padding: '12px 16px', 
      borderRadius: '8px', 
      boxShadow: 'var(--shadow-md)',
      minWidth: '180px'
    }}>
      <div className="mono" style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase' }}>T-{d?.index} DATA POINT</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '4px' }}>
        <span className="body-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Raw Value:</span>
        <span className="mono" style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '700' }}>{d.raw_value?.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '4px' }}>
        <span className="body-text" style={{ color: 'var(--brand-primary)', fontSize: '12px' }}>Cleaned:</span>
        <span className="mono" style={{ color: 'var(--brand-primary)', fontSize: '12px', fontWeight: '700' }}>{d.cleaned_value?.toFixed(2)}</span>
      </div>
      {d?.was_anomaly === 1 && (
        <div style={{ color: 'var(--status-err)', fontSize: '10px', fontWeight: '700', marginTop: '8px', borderTop: '1px solid var(--border-dim)', paddingTop: '6px' }}>
          ⚠ ANOMALY DETECTED
        </div>
      )}
    </div>
  );
};

export default function AnomalyPanel() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState({ total: 0, anomalies: 0, rate: 0 });
  const [recentAnomalies, setRecentAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);

  const selected = CHANNELS[selectedIdx];

  useEffect(() => {
    setLoading(true);
    const { component, resource } = selected;

    Promise.all([
      fetch(`/api/anomaly-data?component=${component}&resource=${resource}&hours=168`).then(r => r.json()),
      fetch(`/api/anomalies?component=${component}`).then(r => r.json()),
    ]).then(([adData, alogData]) => {
      const raw = (adData.data || []).slice(0, 200).map((d, i) => ({
        index: i,
        raw_value: d.raw_value,
        cleaned_value: d.cleaned_value,
        was_anomaly: d.was_anomaly,
        anomaly_score: d.anomaly_score,
      }));
      setChartData(raw);
      setStats({
        total: adData.total_points || raw.length,
        anomalies: adData.anomaly_count || 0,
        rate: adData.total_points > 0
          ? ((adData.anomaly_count / adData.total_points) * 100).toFixed(1)
          : 0,
      });
      const alog = (alogData.anomalies || []).slice(0, 8);
      setRecentAnomalies(alog);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedIdx]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header & Channel Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="page-title">Anomaly Filter</h2>
          <p className="body-text" style={{ marginTop: '4px' }}>Two-stage martingale signal isolation (Z-score & Medians)</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '500px', justifyContent: 'flex-end' }}>
          {CHANNELS.map((ch, i) => (
            <button key={i} 
              onClick={() => setSelectedIdx(i)}
              style={{
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: '600',
                background: i === selectedIdx ? 'var(--bg-card-hover)' : 'transparent',
                border: `1px solid ${i === selectedIdx ? 'var(--brand-primary)' : 'var(--border-dim)'}`,
                color: i === selectedIdx ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.02em'
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        <StatCard 
          label="Total Data Points" 
          value={stats.total.toLocaleString()} 
          subValue="168-HOUR OBSERVATION WINDOW"
          icon="📊" 
          color="var(--brand-accent)"
        />
        <StatCard 
          label="Anomalies Detected" 
          value={stats.anomalies} 
          subValue={`${stats.rate}% CONTAMINATION RATE`}
          icon="⚠" 
          color="var(--status-err)"
        />
        <StatCard 
          label="Clean Data Points" 
          value={(stats.total - stats.anomalies).toLocaleString()} 
          subValue="PASSED TO INTELLIGENCE ENGINE"
          icon="🛡" 
          color="var(--brand-primary)"
        />
      </div>

      {/* Main Chart Card */}
      <ChartCard 
        title={`Signal Reconstruction: ${selected.label}`}
        headerRight={
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="meta-text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', border: '1px solid var(--text-muted)' }} /> RAW
            </div>
            <div className="meta-text" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-primary)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-primary)' }} /> CLEANED
            </div>
            <div className="meta-text" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-err)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-err)' }} /> ANOMALY
            </div>
          </div>
        }
      >
        {loading ? (
          <div className="body-text" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Mono' }}>SYNCHRONIZING BUFFER...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" vertical={false} opacity={0.4} />
              <XAxis dataKey="index" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="raw_value" stroke="var(--text-muted)" strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.4} />
              <Line type="monotone" dataKey="cleaned_value" stroke="var(--brand-primary)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Scatter 
                data={chartData.filter(d => d.was_anomaly === 1)} 
                dataKey="raw_value" 
                fill="var(--status-err)" 
                r={4}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Recently Logged Anomalies */}
      {recentAnomalies.length > 0 && (
        <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-card)', display: 'flex', justifyContent: 'space-between' }}>
            <h3 className="section-title" style={{ fontSize: '16px', color: 'var(--status-err)' }}>Recent Anomaly Log</h3>
            <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>CHANNEL: {selected.component}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-dim)', background: 'var(--bg-card-hover)' }}>
                  {['TIMESTAMP', 'RESOURCE', 'ANOMALOUS', 'REPLACEMENT', 'SEVERITY'].map(h => (
                    <th key={h} className="meta-text" style={{ padding: '16px 24px', fontWeight: '700', letterSpacing: '0.1em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentAnomalies.map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)', transition: 'background 0.2s' }} className="table-row-hover">
                    <td className="mono" style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--text-secondary)' }}>{String(a.timestamp || '').slice(11, 19)}</td>
                    <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{a.resource.toUpperCase()}</td>
                    <td className="mono" style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--status-err)', fontWeight: '600' }}>{Number(a.anomalous_value || 0).toFixed(2)}</td>
                    <td className="mono" style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--brand-primary)', fontWeight: '600' }}>{Number(a.replacement || 0).toFixed(2)}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span className="meta-text" style={{ 
                        fontWeight: '800', 
                        background: a.anomaly_type === 'severe' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                        color: a.anomaly_type === 'severe' ? 'var(--status-err)' : 'var(--status-warn)',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '11px'
                      }}>
                        {String(a.anomaly_type || 'moderate').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}