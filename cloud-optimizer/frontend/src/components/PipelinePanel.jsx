import React, { useState } from 'react';

const COMPONENTS = ['paas_payment', 'iaas_webpage', 'saas_database'];
const RESOURCES  = {
  paas_payment:  ['acu', 'ram'],
  iaas_webpage:  ['acu', 'iops'],
  saas_database: ['dtu', 'storage'],
};

const STAGE_DEFS = [
  { id: 'detect', name: '01 — Anomaly Detection', icon: '⬡',
    desc: 'Two-Stage Martingale + Z-Score Filter\nε=0.9 · threshold=20 · z>5.0\n→ Isolation & Data Cleaning' },
  { id: 'predict', name: '02 — ML Prediction', icon: '◈',
    desc: 'BayesianRidge · RandomForest · GradientBoosting · MLP\nBest RMSE wins · picks best from 4 engines\n→ 168-hour demand forecast generation' },
  { id: 'optimize', name: '03 — PSO Optimization', icon: '▲',
    desc: '300 particles · 500 epochs · Stability F=0.4\nInteger Particle Swarm Optimization\n→ Azure Tier Allocation & Cost Savings' },
];

const s = {
  label: { fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block', fontWeight: '700' },
  select: {
    width: '100%',
    background: 'var(--bg-main)',
    border: '1px solid var(--border-dim)',
    color: 'var(--text-primary)',
    padding: '12px 14px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '15px',
    borderRadius: '10px',
    marginBottom: '20px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  },
  stageCard: (status) => ({
    background: status === 'done' ? 'rgba(34, 197, 94, 0.05)' : status === 'running' ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-card)',
    border: `1px solid ${status === 'done' ? 'var(--brand-primary)' : status === 'running' ? 'var(--brand-accent)' : 'var(--border-dim)'}`,
    borderRadius: '16px',
    padding: '24px',
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    opacity: status === 'idle' ? 0.7 : 1
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
      return `Total Points: ${r.total_points?.toLocaleString()} | Anomalies: ${r.anomaly_count} (${r.anomaly_rate_pct}%)`;
    if (stageKey === 'predict')
      return `Best Intelligence: ${r.best_model} | Horizon: ${r.forecast_hours}h forecast generated | RMSE Verified`;
    if (stageKey === 'optimize')
      return `Target Cost: $${r.monthly_cost}/mo | Net Savings: ${r.savings_pct}% | Optimal Tier: ${r.tier_assignments?.[0]?.tier_name}`;
    return '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">ML Transformation Pipeline</h2>
          <p className="body-text" style={{ marginTop: '4px' }}>Execute end-to-end intelligent cost optimization workflows</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ 
                    height: '4px', 
                    width: '32px', 
                    background: Object.values(stages).filter(s => s === 'done').length >= i ? 'var(--brand-primary)' : 'var(--border-dim)', 
                    borderRadius: '2px',
                    transition: 'all 0.5s ease'
                  }} />
                ))}
            </div>
            <span className="meta-text" style={{ fontWeight: '700', fontFamily: 'Space Mono' }}>PIPELINE STATUS</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '32px', alignItems: 'start' }}>
        {/* Left Controls */}
        <div className="premium-card">
            <h3 className="section-title" style={{ marginBottom: '24px', letterSpacing: '0.02em' }}>Execution Config</h3>
            
            <label style={s.label}>Service Component</label>
            <select style={s.select} value={component}
              onChange={e => { setComponent(e.target.value); setResource(RESOURCES[e.target.value][0]); }}>
              {COMPONENTS.map(c => <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>)}
            </select>

            <label style={s.label}>Optimization Metric</label>
            <select style={s.select} value={resource}
              onChange={e => setResource(e.target.value)}>
              {RESOURCES[component].map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>

            <div style={{ background: 'var(--input-bg)', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid var(--border-dim)' }}>
              {[
                { label: 'Swarm Population', value: '300' },
                { label: 'Search Iterations', value: '500' },
                { label: 'Forecast Horizon', value: '168H' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '8px 0' }}>
                  <span className="body-text" style={{ fontWeight: '500' }}>{label}</span>
                  <span className="mono" style={{ color: 'var(--brand-accent)', fontWeight: '700' }}>{value}</span>
                </div>
              ))}
            </div>

            <button 
              className="btn-primary" 
              style={{ 
                width: '100%', 
                background: loading ? 'var(--bg-card-hover)' : 'var(--brand-primary)', 
                color: '#fff',
                fontSize: '15px',
                padding: '14px 24px',
                fontWeight: '700',
                letterSpacing: '0.02em',
                cursor: loading ? 'wait' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(34, 197, 94, 0.2)'
              }}
              onClick={runPipeline}
              disabled={loading}
            >
              {loading ? 'RUNNING INTELLIGENCE FLOW...' : 'EXECUTE FULL PIPELINE'}
            </button>

            {error && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: 'var(--status-err)', fontSize: '13px', fontFamily: 'Space Mono', lineHeight: '1.5' }}>
                ERROR: {error}
              </div>
            )}
        </div>

        {/* Right Progression */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {STAGE_DEFS.map((stage, i) => {
            const status = stages[stage.id];
            const resultText = formatResult(stage.id);
            const [num, name] = stage.name.split(' — ');
            
            return (
              <div key={stage.id} style={s.stageCard(status)}>
                <div style={{ display: 'flex', gap: '32px' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '16px',
                    background: status === 'done' ? 'var(--brand-primary)' : status === 'running' ? 'var(--brand-accent)' : 'var(--bg-main)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', transition: 'all 0.4s',
                    color: status === 'idle' ? 'var(--text-muted)' : '#fff',
                    boxShadow: status === 'running' ? '0 0 20px rgba(59, 130, 246, 0.2)' : 'none'
                  }}>
                    {status === 'done' ? '✓' : stage.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '18px', color: status === 'idle' ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: '700' }}>
                        <span style={{ color: status === 'idle' ? 'inherit' : 'var(--brand-primary)' }}>{num}</span> — {name}
                      </h4>
                      {status === 'running' && (
                         <div style={{ display: 'flex', gap: '4px' }}>
                            {[0,1,2].map(d => <div key={d} style={{ width: '4px', height: '4px', background: 'var(--brand-accent)', borderRadius: '50%', animation: 'pulse 1.5s infinite', animationDelay: `${d*0.2}s` }} />)}
                         </div>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '10px', whiteSpace: 'pre-line', lineHeight: '1.6', fontWeight: '400' }}>{stage.desc}</p>
                    
                    {resultText && (
                      <div className="animate-fadeIn" style={{ 
                        marginTop: '20px', 
                        padding: '16px 20px', 
                        background: 'var(--bg-main)', 
                        borderRadius: '12px', 
                        border: '1px solid var(--border-dim)', 
                        fontFamily: 'Space Mono', 
                        fontSize: '17px', 
                        fontWeight: '700',
                        color: 'var(--brand-primary)', 
                        borderLeft: '5px solid var(--brand-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        lineHeight: '1.4'
                      }}>
                        <span style={{ fontSize: '24px' }}>⚡</span>
                        {resultText}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {results.pipeline_id && (
            <div className="animate-fadeIn" style={{ 
                marginTop: '12px', 
                padding: '40px', 
                borderRadius: '24px', 
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.1))',
                border: '1px solid var(--border-dim)',
                textAlign: 'center',
            }}>
              <div style={{ color: 'var(--brand-primary)', fontWeight: '800', fontSize: '18px', letterSpacing: '0.25em', textTransform: 'uppercase' }}>Strategy Converged</div>
              <div className="meta-text" style={{ marginTop: '10px', fontWeight: '700', fontFamily: 'Space Mono', fontSize: '14px' }}>
                OPTIMIZATION ID: {results.pipeline_id.toUpperCase()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '40px', marginTop: '40px' }}>
                <div>
                   <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>Baseline</div>
                   <div className="stat-number" style={{ fontSize: '36px' }}>${results.optimize.baseline_cost}</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border-dim)', borderRight: '1px solid var(--border-dim)' }}>
                   <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>Optimized</div>
                   <div className="stat-number" style={{ fontSize: '36px', color: 'var(--brand-primary)' }}>${results.optimize.monthly_cost}</div>
                </div>
                <div>
                   <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '8px' }}>Net Savings</div>
                   <div className="stat-number" style={{ fontSize: '36px', color: 'var(--brand-accent)' }}>{results.optimize.savings_pct}%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}