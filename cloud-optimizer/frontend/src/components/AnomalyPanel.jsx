import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';

const CHANNELS = [
  { component: 'paas_payment',  resource: 'acu',     label: 'Payment / ACU',     color: '#f97316' },
  { component: 'paas_payment',  resource: 'ram',     label: 'Payment / RAM',     color: '#fb923c' },
  { component: 'iaas_webpage',  resource: 'acu',     label: 'Webpage / ACU',     color: '#10b981' },
  { component: 'iaas_webpage',  resource: 'iops',    label: 'Webpage / IOPS',    color: '#34d399' },
  { component: 'saas_database', resource: 'dtu',     label: 'Database / DTU',    color: '#3b82f6' },
  { component: 'saas_database', resource: 'storage', label: 'Database / Storage', color: '#60a5fa' },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-dim)', padding: '12px', borderRadius: '8px', minWidth: '180px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
      <div style={{ fontFamily: 'Space Mono', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>T-{d?.index} DATA POINT</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
         <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Raw Value:</span>
         <span style={{ fontSize: '12px', fontFamily: 'Space Mono', fontWeight: '700', color: 'var(--text-main)' }}>{d.raw_value?.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
         <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Cleaned:</span>
         <span style={{ fontSize: '12px', fontFamily: 'Space Mono', fontWeight: '700', color: 'var(--brand-secondary)' }}>{d.cleaned_value?.toFixed(2)}</span>
      </div>
      {d?.was_anomaly === 1 && (
        <div style={{ marginTop: '8px', padding: '4px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', textAlign: 'center', color: 'var(--status-err)', fontSize: '9px', fontWeight: '800', fontFamily: 'Space Mono' }}>
          ⚠ ANOMALY LOGGED
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

  const anomalyPoints = chartData.filter(d => d.was_anomaly === 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Anomaly Intelligent Filter</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Multi-stage signal cleaning using Martingales and Z-Score isolation</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '400px', justifyContent: 'flex-end' }}>
          {CHANNELS.map((ch, i) => (
            <button key={i} 
              onClick={() => setSelectedIdx(i)}
              style={{
                padding: '6px 12px',
                fontSize: '10px',
                fontWeight: '700',
                fontFamily: 'Space Mono',
                background: i === selectedIdx ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                border: `1px solid ${i === selectedIdx ? 'var(--brand-accent)' : 'var(--border-dim)'}`,
                color: i === selectedIdx ? 'var(--brand-accent)' : 'var(--text-muted)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'uppercase'
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {[
          { label: 'Total Telemetry', value: stats.total.toLocaleString(), color: 'var(--brand-accent)', sub: '720H RECENT WINDOW' },
          { label: 'Outliers Detected', value: stats.anomalies, color: 'var(--status-err)', sub: `${stats.rate}% ANOMALY RATE` },
          { label: 'Cleaned Samples', value: (stats.total - stats.anomalies).toLocaleString(), color: 'var(--brand-secondary)', sub: 'PASSED TO ML TRAINER' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="premium-card" style={{ padding: '24px', borderLeft: `4px solid ${color}` }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>{label}</div>
            <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', fontFamily: 'Space Mono', color: 'var(--text-main)' }}>{value}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.05em', fontFamily: 'Space Mono' }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="premium-card animate-fadeIn" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Signal Decomposition: {selected.label}</h3>
          <div style={{ display: 'flex', gap: '20px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'Space Mono' }}>
                <div style={{ width: '12px', height: '2px', background: 'var(--border-active)' }} /> RAW SIGNAL
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--brand-secondary)', fontFamily: 'Space Mono' }}>
                <div style={{ width: '12px', height: '2px', background: 'var(--brand-secondary)' }} /> CLEANED TREND
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--status-err)', fontFamily: 'Space Mono' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-err)' }} /> ANOMALY
             </div>
          </div>
        </div>

        <div style={{ height: '320px', width: '100%' }}>
          {loading ? (
             <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'Space Mono', letterSpacing: '0.2em' }}>SYNCHRONIZING BUFFER...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--border-dim)" vertical={false} opacity={0.3} />
                <XAxis dataKey="index" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="raw_value" stroke="var(--border-active)" strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="cleaned_value" stroke="var(--brand-secondary)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Scatter data={anomalyPoints} dataKey="raw_value" fill="var(--status-err)" r={4} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {recentAnomalies.length > 0 && (
        <div className="premium-card glass animate-fadeIn" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--status-err)', fontWeight: '800' }}>Live Anomaly Audit Trail</h3>
             <span style={{ fontSize: '10px', fontFamily: 'Space Mono', color: 'var(--text-muted)' }}>ID: {selected.component.toUpperCase()}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-dim)' }}>
                {['Event Timestamp', 'Resource', 'Peak Value', 'Correction', 'Severity'].map(h => (
                  <th key={h} style={{ padding: '16px 24px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAnomalies.map((a, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-main)' }}>
                  <td style={{ padding: '14px 24px', fontSize: '12px', fontFamily: 'Space Mono', color: 'var(--text-dim)' }}>{String(a.timestamp || '').slice(11, 19)}</td>
                  <td style={{ padding: '14px 24px', fontSize: '12px', color: 'var(--text-main)', fontWeight: '600' }}>{a.resource.toUpperCase()}</td>
                  <td style={{ padding: '14px 24px', fontSize: '12px', fontFamily: 'Space Mono', color: 'var(--status-err)' }}>{Number(a.anomalous_value || 0).toFixed(2)}</td>
                  <td style={{ padding: '14px 24px', fontSize: '12px', fontFamily: 'Space Mono', color: 'var(--brand-secondary)' }}>{Number(a.replacement || 0).toFixed(2)}</td>
                  <td style={{ padding: '14px 24px' }}>
                     <span style={{ fontSize: '9px', fontWeight: '800', background: a.anomaly_type === 'severe' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: a.anomaly_type === 'severe' ? 'var(--status-err)' : 'var(--status-warn)', padding: '3px 8px', borderRadius: '4px', border: `1px solid ${a.anomaly_type === 'severe' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}` }}>
                       {String(a.anomaly_type || 'moderate').toUpperCase()}
                     </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}