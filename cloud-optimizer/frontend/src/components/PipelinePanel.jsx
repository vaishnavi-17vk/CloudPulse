import React, { useState } from 'react';

const COMPONENTS = ['paas_payment', 'iaas_webpage', 'saas_database'];
const RESOURCES  = {
  paas_payment:  ['acu', 'ram'],
  iaas_webpage:  ['acu', 'iops'],
  saas_database: ['dtu', 'storage'],
};

const STAGE_DEFS = [
  { id: 'detect', name: '01 — Anomaly Detection', icon: '⬡',
    desc: 'Two-Stage Martingale + Z-Score Filter\nε=0.9 · threshold=20 · z>5.0\n→ Writes cleaned_metrics + anomaly_log' },
  { id: 'predict', name: '02 — ML Prediction', icon: '◈',
    desc: 'BayesianRidge · RandomForest · GradientBoosting · MLP\n13 features · 80/20 split · Best RMSE wins\n→ Writes 168-hour forecast to ml_predictions' },
  { id: 'optimize', name: '03 — PSO Optimization', icon: '▲',
    desc: '30 particles · 50 epochs · Stability F=0.4\nAzure tier selection per hour\n→ Writes optimization_results + cost_tracking' },
];


const s = {
  label: { fontFamily: "'Outfit', sans-serif", fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block', fontWeight: '600' },
  select: {
    width: '100%',
    background: 'var(--input-bg)',
    border: '1px solid var(--border-dim)',
    color: 'var(--text-main)',
    padding: '10px 14px',
    fontFamily: "'Space Mono', monospace",
    fontSize: '12px',
    borderRadius: '6px',
    marginBottom: '20px',
    cursor: 'pointer',
    outline: 'none',
  },
  stageCard: (status) => ({
    background: status === 'done' ? 'rgba(16, 185, 129, 0.03)' : status === 'running' ? 'rgba(249, 115, 22, 0.03)' : 'var(--bg-card)',
    border: `1px solid ${status === 'done' ? 'rgba(16, 185, 129, 0.2)' : status === 'running' ? 'rgba(249, 115, 22, 0.2)' : 'var(--border-dim)'}`,
    borderRadius: '10px',
    padding: '20px',
    transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    position: 'relative',
    boxShadow: status === 'running' ? '0 0 20px rgba(249, 115, 22, 0.05)' : 'none'
  }),
};

export default function PipelinePanel() {
  const [component, setComponent] = useState('saas_database');
  const [resource, setResource]   = useState('dtu');
  const [loading, setLoading]     = useState(false);
  const [stages, setStages]       = useState({ detect: 'idle', predict: 'idle', optimize: 'idle' });
  const [results, setResults]     = useState({});
  const [error, setError]         = useState(null);

  const runPipeline = async () => {
    setLoading(true);
    setError(null);
    setResults({});
    setStages({ detect: 'running', predict: 'idle', optimize: 'idle' });

    try {
      // 1. Detect
      const res1 = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, resource }),
      });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.detail || 'Detection failed');
      setResults(prev => ({ ...prev, detect: data1 }));
      setStages({ detect: 'done', predict: 'running', optimize: 'idle' });

      // 2. Predict
      const res2 = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, resource }),
      });
      const data2 = await res2.json();
      if (!res2.ok) throw new Error(data2.detail || 'Prediction failed');
      setResults(prev => ({ ...prev, predict: data2 }));
      setStages({ detect: 'done', predict: 'done', optimize: 'running' });

      // 3. Optimize
      const res3 = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, resource }),
      });
      const data3 = await res3.json();
      if (!res3.ok) throw new Error(data3.detail || 'Optimization failed');
      setResults(prev => ({ ...prev, optimize: data3, pipeline_id: 'pipeline_seq_' + Math.random().toString(36).substr(2, 6) }));
      setStages({ detect: 'done', predict: 'done', optimize: 'done' });
    } catch (e) {
      setError(e.message);
      setStages(prev => {
        const next = { ...prev };
        for (const k in next) { if (next[k] === 'running') next[k] = 'error'; }
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (stageKey) => {
    if (!results[stageKey]) return null;
    const r = results[stageKey];
    if (stageKey === 'detect')
      return `Points:   ${r.total_points?.toLocaleString()}\nAnomalies: ${r.anomaly_count} (${r.anomaly_rate_pct}%)\nCleaned:  ${(r.total_points - r.anomaly_count)?.toLocaleString()}`;
    if (stageKey === 'predict')
      return `Best Model:    ${r.best_model}\nForecast:      ${r.forecast_hours}h ahead\nRMSE Table:\n${Object.entries(r.rmse_table || {}).map(([k,v]) => `  ${k}: ${Number(v).toFixed(3)}`).join('\n')}`;
    if (stageKey === 'optimize')
      return `Monthly Cost:  $${r.monthly_cost}\nBaseline Cost: $${r.baseline_cost}\nSavings:       ${r.savings_pct}%\nTop Tier:      ${r.tier_assignments?.[0]?.tier_name}`;
    return '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Pipeline Runner</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Execute end-to-end Machine Learning optimization flow</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ height: '4px', width: '40px', background: stages.detect === 'done' ? 'var(--brand-secondary)' : 'var(--border-dim)', borderRadius: '2px' }} />
            <div style={{ height: '4px', width: '40px', background: stages.predict === 'done' ? 'var(--brand-secondary)' : 'var(--border-dim)', borderRadius: '2px' }} />
            <div style={{ height: '4px', width: '40px', background: stages.optimize === 'done' ? 'var(--brand-secondary)' : 'var(--border-dim)', borderRadius: '2px' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
        {/* Sidebar Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="premium-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '20px', letterSpacing: '0.05em' }}>Execution Config</h3>
            
            <label style={s.label}>Service Component</label>
            <select style={s.select} value={component}
              onChange={e => { setComponent(e.target.value); setResource(RESOURCES[e.target.value][0]); }}>
              {COMPONENTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={s.label}>Monitoring Metric</label>
            <select style={s.select} value={resource}
              onChange={e => setResource(e.target.value)}>
              {RESOURCES[component].map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <div style={{ background: 'var(--input-bg)', borderRadius: '8px', padding: '16px', marginBottom: '20px', border: '1px solid var(--border-dim)' }}>
              {[
                { label: 'Particles', value: '30' },
                { label: 'Iterations', value: '50' },
                { label: 'Horizon', value: '168H' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
                  <span style={{ color: 'var(--brand-accent)', fontWeight: '700', fontFamily: 'Space Mono' }}>{value}</span>
                </div>
              ))}
            </div>

            <button 
              className="btn-primary" 
              style={{ width: '100%', opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer' }}
              onClick={runPipeline}
              disabled={loading}
            >
              {loading ? 'EXECUTING PIPELINE...' : 'START FULL OPTIMIZATION'}
            </button>

            {error && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', color: 'var(--status-err)', fontSize: '12px', fontFamily: 'Space Mono' }}>
                {error}
              </div>
            )}
          </div>

        </div>

        {/* Main Progression */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {STAGE_DEFS.map((stage, i) => {
            const status = stages[stage.id];
            const resultText = formatResult(stage.id);
            return (
              <div key={stage.id} style={s.stageCard(status)}>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: status === 'done' ? 'var(--brand-secondary)' : status === 'running' ? 'var(--brand-primary)' : 'var(--bg-card-hover)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', transition: 'all 0.4s'
                  }}>
                    {status === 'done' ? '✓' : stage.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '15px', color: status === 'idle' ? 'var(--text-muted)' : 'var(--text-main)' }}>{stage.name}</h4>
                      {status === 'running' && <div className="loading-spinner" style={{ width: '12px', height: '12px', border: '2px solid var(--brand-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-slow 1s linear infinite' }} />}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px', whiteSpace: 'pre-line', lineHeight: '1.6' }}>{stage.desc}</p>
                    
                    {resultText && (
                      <div className="animate-fadeIn" style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-dim)', fontFamily: 'Space Mono', fontSize: '12px', color: 'var(--brand-secondary)', lineClamp: 'none', whiteSpace: 'pre-wrap' }}>
                        {resultText}
                      </div>
                    )}
                  </div>
                </div>
                {i < STAGE_DEFS.length - 1 && (
                  <div style={{ position: 'absolute', bottom: '-21px', left: '44px', width: '1px', height: '20px', background: 'var(--border-dim)' }} />
                )}
              </div>
            );
          })}

          {results.pipeline_id && (
            <div className="animate-fadeIn glass" style={{ marginTop: '10px', padding: '24px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
              <div style={{ color: 'var(--brand-secondary)', fontWeight: '800', fontSize: '14px', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Workflow Optimized</div>
              <div style={{ fontFamily: 'Space Mono', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                TRANSACTION ID: {results.pipeline_id.toUpperCase()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginTop: '20px' }}>
                <div>
                   <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>BASELINE</div>
                   <div style={{ fontSize: '18px', fontWeight: '700' }}>${results.optimize.baseline_cost}</div>
                </div>
                <div style={{ width: '1px', background: 'var(--border-dim)' }} />
                <div>
                   <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>OPTIMIZED</div>
                   <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brand-secondary)' }}>${results.optimize.monthly_cost}</div>
                </div>
                <div style={{ width: '1px', background: 'var(--border-dim)' }} />
                <div>
                   <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>SAVINGS</div>
                   <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--brand-primary)' }}>{results.optimize.savings_pct}%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}