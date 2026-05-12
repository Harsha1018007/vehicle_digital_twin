#!/bin/bash
# ============================================================================
# Vehicle Digital Twin - Setup Script
# ============================================================================
# This script sets up the virtual CAN interface and prepares the environment.
# Run with: bash setup.sh
# ============================================================================

set -e

echo "🚗 Vehicle Digital Twin - Setup"
echo "================================"

# Check OS
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "⚠️  This script requires Linux (or WSL2 on Windows)"
    exit 1
fi

# Step 1: Setup virtual CAN
echo ""
echo "[1/3] Setting up virtual CAN interface..."
sudo modprobe vcan
sudo ip link delete vcan0 2>/dev/null || true
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
echo "✅ vcan0 interface is up"

# Step 2: Install Python dependencies
echo ""
echo "[2/3] Installing Python dependencies..."
pip install -r requirements.txt
echo "✅ Dependencies installed"

# Step 3: Train the ML model
echo ""
echo "[3/3] Training the anomaly detection model..."
python ml_model/train_model.py
echo "✅ Model trained"

echo ""
echo "================================"
echo "🎉 Setup complete!"
echo ""
echo "To run the project, open 5 terminals and run:"
echo "  Terminal 1:  python ecu_simulators/engine_ecu.py --faults"
echo "  Terminal 2:  python ecu_simulators/brake_ecu.py --faults"
echo "  Terminal 3:  python ecu_simulators/speed_ecu.py --faults"
echo "  Terminal 4:  uvicorn dashboard.api:app --reload"
echo "  Terminal 5:  streamlit run dashboard/streamlit_app.py"
echo ""
echo "Then open: http://localhost:8501"
echo "================================"
