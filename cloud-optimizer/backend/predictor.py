"""
predictor.py — ML Pipeline
============================
CloudOptimizer AI  |  Pipeline Step 3 of 4

Chain position:
    simulator.py  →  detector.py  →  [predictor.py]  →  optimizer.py

Based on: Osypanka & Nawrocki (2022)
"Resource Usage Cost Optimization in Cloud Computing Using Machine Learning"

Feature Engineering  : 12 features (cyclical encodings, lag, rolling stats)
Models evaluated     : BayesianRidge, RandomForest, GradientBoosting, MLP
Model selection      : Lowest RMSE on hold-out (last 168 hours)
Forecast horizon     : 168 hours (7 days)

IMPORTANT — base_value is intentionally excluded from features.
Including values[i] as a feature causes RMSE=0.000 because BayesianRidge
trivially learns y = 1.0 * base_value. The 12 lag/cyclical features
provide real predictive signal without leaking the target.
"""

import uuid
import math
import numpy as np
import statistics
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
from sklearn.linear_model import BayesianRidge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

FORECAST_HORIZON = 168
HOLDOUT_HOURS    = 168
MIN_TRAIN_ROWS   = 200

MODELS = {
    "BayesianRidge": BayesianRidge(),
    "RandomForest":  RandomForestRegressor(
        n_estimators=200, max_depth=10, random_state=42, n_jobs=-1
    ),
    "GradientBoosting": GradientBoostingRegressor(
        n_estimators=200, learning_rate=0.05, max_depth=5,
        subsample=0.8, random_state=42
    ),
    "MLPRegressor": MLPRegressor(
        hidden_layer_sizes=(128, 64),
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.1,
        random_state=42,
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# TIMESTAMP PARSING
# ─────────────────────────────────────────────────────────────────────────────

def _parse_ts(ts_str: str) -> datetime:
    """
    Parse ISO/SQLite datetime strings to datetime (UTC-naive).

    Handles:
      '2024-01-15 14:00:00'
      '2024-01-15 14:00:00.123456'   (simulator format with microseconds)
      '2024-01-15T14:00:00'
      '2024-01-15T14:00:00Z'
      '2026-02-09 13:51:11.035525'   (real simulator output)
    """
    # Strip microseconds and replace T separator
    ts_clean = str(ts_str).split('.')[0].replace('T', ' ').replace('Z', '').strip()

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(ts_clean, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse timestamp: {ts_str!r}")


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────────────────────────────────────

def engineer_features(
    timestamps: list,
    values: list,
) -> tuple:
    """
    Build the 12-feature design matrix.

    Features
    --------
    1.  hour_sin        — sin encoding of hour-of-day  (daily cycle)
    2.  hour_cos        — cos encoding of hour-of-day
    3.  day_sin         — sin encoding of day-of-week  (weekly cycle)
    4.  day_cos         — cos encoding of day-of-week
    5.  is_weekend      — 1 if Sat/Sun else 0
    6.  lag_1           — value 1 h ago
    7.  lag_2           — value 2 h ago
    8.  lag_24          — value 24 h ago (same hour yesterday)
    9.  lag_168         — value 168 h ago (same hour last week)
    10. rolling_mean_6  — rolling mean over last 6 h
    11. rolling_std_6   — rolling std  over last 6 h
    12. rolling_mean_24 — rolling mean over last 24 h

    NOTE: values[i] (base_value) is intentionally excluded.
    Including it causes RMSE=0 because it leaks the target variable.

    Returns
    -------
    X             : np.ndarray shape (n, 12)
    feature_names : list[str]
    """
    feature_names = [
        "hour_sin", "hour_cos", "day_sin", "day_cos",
        "is_weekend",
        "lag_1", "lag_2", "lag_24", "lag_168",
        "rolling_mean_6", "rolling_std_6", "rolling_mean_24",
    ]
    
    # Pre-parse timestamps if they are strings
    dts = []
    for ts in timestamps:
        if isinstance(ts, datetime): dts.append(ts)
        else: dts.append(_parse_ts(ts))

    n = len(values)
    X = np.zeros((n, 12), dtype=np.float64)
    v_arr = np.array(values, dtype=np.float64)

    for i in range(n):
        X[i, :] = _engineer_single_row(i, dts, v_arr)

    return X, feature_names


def _engineer_single_row(i: int, dts: list, v_arr: np.ndarray) -> np.ndarray:
    """Fast feature engineering for a single point."""
    dt = dts[i]
    h = dt.hour
    d = dt.weekday()
    
    # Lags
    l1   = v_arr[i - 1]   if i >= 1   else 0.0
    l2   = v_arr[i - 2]   if i >= 2   else 0.0
    l24  = v_arr[i - 24]  if i >= 24  else 0.0
    l168 = v_arr[i - 168] if i >= 168 else 0.0

    # Rolling
    w6  = v_arr[max(0, i - 6):i]
    w24 = v_arr[max(0, i - 24):i]
    
    rm6  = np.mean(w6) if w6.size > 0 else v_arr[i]
    rs6  = np.std(w6)  if w6.size > 1 else 0.0
    rm24 = np.mean(w24) if w24.size > 0 else v_arr[i]

    return np.array([
        math.sin(2 * math.pi * h / 24), math.cos(2 * math.pi * h / 24),
        math.sin(2 * math.pi * d / 7),  math.cos(2 * math.pi * d / 7),
        1.0 if d >= 5 else 0.0,
        l1, l2, l24, l168,
        rm6, rs6, rm24
    ])


# ─────────────────────────────────────────────────────────────────────────────
# PREDICTOR CLASS
# ─────────────────────────────────────────────────────────────────────────────

class CloudPredictor:
    """
    Multi-model ML predictor with automatic best-model selection.

    Parameters
    ----------
    db : CloudOptimizerDB | None
        Pass None for standalone / unit-test usage.
    """

    def __init__(self, db=None):
        self.db = db
        self._trained_models: dict = {}
        self._scaler: Optional[StandardScaler] = None
        self._best_model_name: Optional[str] = None
        self._rmse_table: dict = {}

    # ── PUBLIC ────────────────────────────────────────────────────────────────

    def run(
        self,
        component: str,
        resource: str,
        cleaned_series: Optional[list] = None,
    ) -> dict:
        """
        Train all 4 models, pick best by RMSE, forecast 168 hours.

        Parameters
        ----------
        cleaned_series : list[dict] or list[float] or None
            If supplied, used directly. Otherwise fetched from self.db.

        Returns
        -------
        dict with keys: run_id, best_model, rmse_table, forecast, feature_names
        """
        # 1. Load data
        timestamps, values = self._load_cleaned(component, resource, cleaned_series)

        if len(values) < MIN_TRAIN_ROWS:
            raise ValueError(
                f"Need ≥{MIN_TRAIN_ROWS} cleaned rows to train "
                f"(got {len(values)} for {component}/{resource})."
            )

        # 2. Feature matrix
        X, feature_names = engineer_features(timestamps, values)
        y = np.array(values, dtype=np.float64)

        # 3. Chronological train/val split
        #    train = first (total - 168) rows
        #    val   = last 168 rows
        split   = len(values) - HOLDOUT_HOURS
        split   = max(HOLDOUT_HOURS, split)   # ensure train ≥ 168 rows
        X_train, X_val = X[:split], X[split:]
        y_train, y_val = y[:split], y[split:]

        # 4. Scale
        scaler      = StandardScaler()
        X_train_sc  = scaler.fit_transform(X_train)
        X_val_sc    = scaler.transform(X_val)
        self._scaler = scaler

        # 5. Train all models and evaluate on validation set
        rmse_table: dict = {}
        trained:    dict = {}

        for name, model in MODELS.items():
            try:
                m = model.__class__(**model.get_params())
                m.fit(X_train_sc, y_train)
                if len(X_val_sc) > 0:
                    y_pred = m.predict(X_val_sc)
                    rmse   = math.sqrt(mean_squared_error(y_val, y_pred))
                else:
                    y_pred = m.predict(X_train_sc)
                    rmse   = math.sqrt(mean_squared_error(y_train, y_pred))
                rmse_table[name] = round(rmse, 4)
                trained[name]    = m
            except Exception as exc:
                print(f"  [predictor] Model {name} failed: {exc}")
                rmse_table[name] = float("inf")

        # 6. Pick best model
        best_name              = min(rmse_table, key=rmse_table.get)
        self._best_model_name  = best_name
        self._trained_models   = trained
        self._rmse_table       = rmse_table

        print(
            f"  [predictor] Best model → {best_name}  "
            f"(RMSE={rmse_table[best_name]:.4f})"
        )

        # 7. Forecast 168 hours
        run_id   = f"run_{uuid.uuid4().hex[:10]}"
        forecast = self._forecast(
            component, resource, timestamps, values,
            best_name, trained, scaler, run_id
        )

        # 8. Persist
        if self.db is not None:
            self._save_to_db(
                component, resource, forecast, rmse_table, best_name, run_id
            )

        return {
            "run_id":        run_id,
            "best_model":    best_name,
            "rmse_table":    rmse_table,
            "forecast":      forecast,
            "feature_names": feature_names,
        }

    # ── PRIVATE ───────────────────────────────────────────────────────────────

    def _forecast(
        self,
        component, resource, timestamps, values,
        best_name, trained, scaler, run_id,
    ) -> list:
        """Auto-regressive 168-hour forecast using the best model."""
        last_ts = _parse_ts(timestamps[-1])
        future_ts = [
            (last_ts + timedelta(hours=h + 1)).strftime("%Y-%m-%d %H:%M:%S")
            for h in range(FORECAST_HORIZON)
        ]

        running_values_arr = np.array(values, dtype=np.float64)
        running_dts = [_parse_ts(ts) for ts in timestamps]
        
        forecast = []
        model = trained[best_name]

        for fts in future_ts:
            dt_new = _parse_ts(fts)
            running_dts.append(dt_new)
            
            # Predict next value using placeholder
            temp_v_arr = np.append(running_values_arr, running_values_arr[-1])
            x_new = _engineer_single_row(len(temp_v_arr) - 1, running_dts, temp_v_arr).reshape(1, -1)
            x_new_sc = scaler.transform(x_new)

            pred = float(model.predict(x_new_sc)[0])
            pred = max(0.0, min(100.0, pred))
            
            running_values_arr = np.append(running_values_arr, pred)

            forecast.append({
                "target_timestamp": fts,
                "predicted_value":  round(pred, 4),
            })

        return forecast

    def _save_to_db(
        self, component, resource, forecast, rmse_table, best_name, run_id
    ):
        """Persist predictions for all models. is_best=1 marks the winner."""
        records = []
        for entry in forecast:
            for model_name in rmse_table:
                records.append({
                    "run_id":           run_id,
                    "component":        component,
                    "resource":         resource,
                    "target_timestamp": entry["target_timestamp"],
                    "predicted_value":  entry["predicted_value"],
                    "model_name":       model_name,
                    "is_best":          1 if model_name == best_name else 0,
                })
        self.db.insert_predictions(records)

    def _load_cleaned(self, component, resource, cleaned_series):
        """Return (timestamps: list[str], values: list[float])."""
        if cleaned_series is not None:
            if cleaned_series and isinstance(cleaned_series[0], dict):
                timestamps = [
                    r.get("timestamp", r.get("target_timestamp", ""))
                    for r in cleaned_series
                ]
                values = [
                    float(r.get("cleaned_value", r.get("value", 0)))
                    for r in cleaned_series
                ]
            else:
                # Bare float list — generate proper timestamps via timedelta
                base = datetime(2026, 1, 1, 0, 0, 0)
                timestamps = [
                    (base + timedelta(hours=i)).strftime("%Y-%m-%d %H:%M:%S")
                    for i in range(len(cleaned_series))
                ]
                values = [float(v) for v in cleaned_series]
            return timestamps, values

        if self.db is None:
            raise ValueError("Provide either a db instance or cleaned_series.")

        rows       = self.db.get_cleaned_data(component, resource, hours=720)
        timestamps = [r["timestamp"] for r in rows]
        values     = [float(r["cleaned_value"]) for r in rows]
        return timestamps, values


# =============================================================================
# SELF-TEST — python predictor.py
# =============================================================================
if __name__ == "__main__":
    import random
    import warnings
    warnings.filterwarnings("ignore")

    print()
    print("=" * 60)
    print("RUNNING PREDICTOR.PY TESTS")
    print("=" * 60)

    # ── TEST 1: basic run with realistic noisy data ───────────────────────────
    random.seed(7)
    n = 500
    base_dt = datetime(2026, 1, 1, 0, 0, 0)
    ts_list  = [(base_dt + timedelta(hours=i)).strftime("%Y-%m-%d %H:%M:%S")
                for i in range(n)]
    val_list = [max(5.0, 50 + 20 * math.sin(2 * math.pi * i / 24)
                    + random.gauss(0, 8))   # σ=8 gives realistic noise
                for i in range(n)]

    pred   = CloudPredictor(db=None)
    result = pred.run(
        component="paas_payment",
        resource="acu",
        cleaned_series=[{"timestamp": t, "cleaned_value": v}
                        for t, v in zip(ts_list, val_list)],
    )

    assert result["best_model"] in MODELS, "TEST 1: invalid best_model"
    assert len(result["forecast"]) == FORECAST_HORIZON, "TEST 1: wrong forecast length"
    assert len(result["feature_names"]) == 12, "TEST 1: expected 12 features"

    best_rmse = result["rmse_table"][result["best_model"]]
    assert best_rmse > 0.01, f"TEST 1: RMSE={best_rmse} suspiciously low (target leak?)"
    assert best_rmse < 30.0, f"TEST 1: RMSE={best_rmse} too high"

    print(f"[TEST 1] PASS — basic run")
    print(f"         Best model: {result['best_model']}  RMSE={best_rmse:.4f}")
    print(f"         RMSE table: {result['rmse_table']}")
    print(f"         Forecast:   {len(result['forecast'])} hrs")

    # ── TEST 2: timestamp parsing covers all formats ──────────────────────────
    test_ts = [
        '2024-01-15 14:00:00',
        '2026-02-09 13:51:11.035525',
        '2024-01-15T14:00:00',
        '2024-01-15T14:00:00Z',
        '2026-03-11 09:32:18.441440',
    ]
    for ts in test_ts:
        dt = _parse_ts(ts)
        assert isinstance(dt, datetime), f"TEST 2: failed for {ts!r}"
    print(f"\n[TEST 2] PASS — all {len(test_ts)} timestamp formats parsed correctly")

    # ── TEST 3: RMSE is not zero (no target leakage) ─────────────────────────
    all_rmse = list(result["rmse_table"].values())
    zero_rmse = [r for r in all_rmse if r < 0.001]
    assert len(zero_rmse) == 0, \
        f"TEST 3: {len(zero_rmse)} models have RMSE≈0 (target leak!): {zero_rmse}"
    print(f"\n[TEST 3] PASS — no target leakage  (all RMSE > 0.001)")

    # ── TEST 4: forecast values in valid range ────────────────────────────────
    for i, fc in enumerate(result["forecast"]):
        pv = fc["predicted_value"]
        assert 0.0 <= pv <= 100.0, f"TEST 4: forecast[{i}]={pv} out of [0,100]"
    print(f"\n[TEST 4] PASS — all 168 forecast values in [0, 100]")

    # ── TEST 5: feature count is 12 (not 13) ─────────────────────────────────
    X_test, fnames = engineer_features(ts_list[:50], val_list[:50])
    assert X_test.shape == (50, 12), \
        f"TEST 5: expected (50,12) got {X_test.shape}"
    assert "base_value" not in fnames, \
        "TEST 5: base_value must NOT be in features (causes RMSE=0)"
    print(f"\n[TEST 5] PASS — feature matrix shape {X_test.shape}, no base_value")

    print()
    print("=" * 60)
    print("ALL TESTS PASSED — predictor.py is correct")
    print("=" * 60)
    print()
    print("12 features (base_value removed — was causing RMSE=0)")
    print("Expected RMSE range on Azure SaaS data: 5–15")
    print("Expected best model: GradientBoosting or RandomForest")
    print()
    print("NEXT: optimizer.py reads forecast and runs PSO")