"""
Vehicle Digital Twin - Streamlit Dashboard
==========================================
Real-time visualization of the digital twin showing live ECU state
and AI-detected fault alerts.

Usage:
    streamlit run dashboard/streamlit_app.py
"""

import streamlit as st
import requests
import time
import pandas as pd
from datetime import datetime


API_URL = "http://localhost:8000"


# ====================== Page Config ======================

st.set_page_config(
    page_title="Vehicle Digital Twin",
    page_icon="🚗",
    layout="wide",
)


# ====================== Custom CSS ======================

st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1f77b4;
        padding-bottom: 1rem;
    }
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1rem;
        border-radius: 10px;
        color: white;
    }
    .anomaly-alert {
        background-color: #ff4444;
        color: white;
        padding: 1rem;
        border-radius: 8px;
        margin: 0.5rem 0;
        font-weight: bold;
    }
    .healthy {
        background-color: #00cc66;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 5px;
        font-weight: bold;
    }
</style>
""", unsafe_allow_html=True)


# ====================== Helpers ======================

@st.cache_data(ttl=0.5)
def fetch_state():
    try:
        return requests.get(f"{API_URL}/state", timeout=2).json()
    except Exception:
        return None


@st.cache_data(ttl=1.0)
def fetch_anomalies(limit: int = 10):
    try:
        return requests.get(f"{API_URL}/anomalies?limit={limit}", timeout=2).json()
    except Exception:
        return None


# ====================== Header ======================

st.markdown('<div class="main-header">🚗 Vehicle Digital Twin Dashboard</div>',
            unsafe_allow_html=True)
st.caption("Real-time CAN bus monitoring with AI-powered fault detection")


# ====================== Sidebar ======================

with st.sidebar:
    st.title("⚙️ Controls")
    refresh_rate = st.slider("Refresh rate (sec)", 0.5, 5.0, 1.0, 0.5)
    show_raw = st.checkbox("Show raw API data", value=False)
    st.markdown("---")
    st.markdown("### About")
    st.info(
        "This dashboard visualizes a virtual vehicle running entirely "
        "in software. Three ECUs (Engine, Brake, Speed) communicate "
        "over a virtual CAN bus. An Isolation Forest model detects "
        "anomalies in real-time."
    )
    st.markdown("---")
    st.markdown("**Author:** Niharika Banothu")
    st.markdown("[GitHub](https://github.com/niharikabanothu)")


# ====================== Main Content ======================

state = fetch_state()
anomaly_data = fetch_anomalies()

if state is None:
    st.error("⚠️ Cannot connect to API at " + API_URL)
    st.info("Start the API with: `uvicorn dashboard.api:app --reload`")
    st.stop()


# === System Status Row ===
col1, col2, col3 = st.columns(3)

with col1:
    last_update = state.get('last_update')
    if last_update:
        st.markdown('<div class="healthy">🟢 SYSTEM ONLINE</div>',
                    unsafe_allow_html=True)
    else:
        st.markdown('<div style="background-color:#ffaa00;color:white;'
                    'padding:0.5rem 1rem;border-radius:5px;font-weight:bold;">'
                    '🟡 WAITING FOR DATA</div>', unsafe_allow_html=True)

with col2:
    st.metric("Total CAN Messages", state.get('total_messages', 0))

with col3:
    st.metric("Total Anomalies Detected",
              state.get('total_anomalies', 0),
              delta_color="inverse")


st.markdown("---")


# === ECU Panels ===
st.subheader("📊 Live ECU State")

ecu_col1, ecu_col2, ecu_col3 = st.columns(3)

with ecu_col1:
    st.markdown("### 🔧 Engine ECU")
    engine = state.get('engine', {})
    st.metric("RPM", f"{engine.get('rpm', 0):,}")
    st.metric("Coolant Temp", f"{engine.get('coolant_temp', 0):.1f} °C")
    st.metric("Throttle", f"{engine.get('throttle', 0)} %")
    st.progress(min(engine.get('rpm', 0) / 8000, 1.0))
    st.caption(f"CAN ID: 0x100")

with ecu_col2:
    st.markdown("### 🛑 Brake ECU")
    brake = state.get('brake', {})
    st.metric("Brake Pressure", f"{brake.get('brake_pressure', 0):.1f} bar")
    st.metric("Pedal Position", f"{brake.get('pedal_position', 0)} %")
    abs_st = brake.get('abs_status', 0)
    st.metric("ABS Status", "🟢 Active" if abs_st else "⚪ Inactive")
    st.progress(min(brake.get('brake_pressure', 0) / 200, 1.0))
    st.caption(f"CAN ID: 0x200")

with ecu_col3:
    st.markdown("### 🛞 Speed ECU")
    speed = state.get('speed', {})
    st.metric("Vehicle Speed", f"{speed.get('speed', 0):.1f} km/h")
    st.metric("Wheel FL", f"{speed.get('wheel_fl', 0):.1f} km/h")
    st.metric("Wheel FR", f"{speed.get('wheel_fr', 0):.1f} km/h")
    st.progress(min(speed.get('speed', 0) / 200, 1.0))
    st.caption(f"CAN ID: 0x300")


st.markdown("---")


# === Anomaly Alerts ===
st.subheader("🚨 AI Fault Detection Alerts")

if anomaly_data and anomaly_data.get('events'):
    events = anomaly_data['events'][:10]
    for evt in events:
        ts = evt.get('timestamp', '')
        diagnosis = evt.get('diagnosis', 'Unknown')
        score = evt.get('score', 0)
        st.markdown(
            f'<div class="anomaly-alert">'
            f'🔴 <b>{diagnosis}</b><br>'
            f'<small>Time: {ts} | Anomaly Score: {score:.3f}</small>'
            f'</div>',
            unsafe_allow_html=True
        )
else:
    st.success("✅ No anomalies detected — vehicle operating normally")


# === Raw Data View ===
if show_raw:
    st.markdown("---")
    st.subheader("🔍 Raw API Data")
    with st.expander("Vehicle State"):
        st.json(state)
    with st.expander("Anomaly Events"):
        st.json(anomaly_data)


# === Auto-refresh ===
time.sleep(refresh_rate)
st.rerun()
