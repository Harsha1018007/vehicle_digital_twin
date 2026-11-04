import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CircleHelp, Code2, Gauge, Pause, Play, Radio, RotateCcw, WifiOff, X } from 'lucide-react'
import { BROWSER_FAULTS } from '../../data/liveVehicleSimulation.js'
import { SIM_CARS } from '../../data/simulatedNetwork.js'
import { useLiveSimulation } from '../../context/LiveSimulationProvider.jsx'
import { readTwinApi } from '../../services/api.js'
import { ApiConsole } from './ApiConsole.jsx'
import { FleetMap } from './FleetMap.jsx'

const ECU_INFO = [
  { key: 'engine', label: 'ENGINE ECU', id: '0x100', icon: Gauge, signals: [['rpm', 'RPM', ' rpm'], ['coolant_temp', 'Coolant', ' °C'], ['throttle', 'Throttle', ' %']] },
  { key: 'brake', label: 'BRAKE ECU', id: '0x200', icon: Activity, signals: [['brake_pressure', 'Pressure', ' bar'], ['pedal_position', 'Pedal', ' %'], ['abs_status', 'ABS', '']] },
  { key: 'speed', label: 'SPEED ECU', id: '0x300', icon: Activity, signals: [['speed', 'Vehicle', ' km/h'], ['wheel_fl', 'Wheel FL', ' km/h'], ['wheel_fr', 'Wheel FR', ' km/h']] },
]

const apiUrlFromStorage = () => {
  try { return window.localStorage.getItem('can-notes-api-url') || import.meta.env.VITE_API_URL || 'http://localhost:8000' }
  catch { return import.meta.env.VITE_API_URL || 'http://localhost:8000' }
}

function useLiveApi(mode, baseUrl) {
  const [result, setResult] = useState({ data: null, error: '', loading: false, receivedAt: null, streamConnected: false, logs: [], counts: {} })
  const recordRequest = useCallback((entry) => {
    const key = entry.path.split('?')[0]
    setResult((current) => ({
      ...current,
      logs: [{ ...entry, id: `${Date.now()}-${Math.random()}`, timestamp: new Date().toISOString() }, ...current.logs].slice(0, 36),
      counts: { ...current.counts, [key]: (current.counts[key] || 0) + 1 },
    }))
  }, [])
  useEffect(() => {
    setResult((current) => ({ ...current, error: '', logs: [], counts: {}, streamConnected: false }))
  }, [mode, baseUrl])
  useEffect(() => {
    if (mode !== 'live') return undefined
    let cancelled = false
    let inFlight = false
    let socket
    let reconnectTimer
    const refresh = async () => {
      if (cancelled || document.hidden || inFlight) return
      inFlight = true
      setResult((current) => ({ ...current, loading: !current.data, error: '' }))
      try {
        const data = await readTwinApi(baseUrl, (entry) => { if (!cancelled) recordRequest(entry) })
        if (!cancelled) setResult((current) => ({
          ...current,
          data: current.streamConnected && current.data?.state ? { ...data, state: current.data.state } : data,
          error: '', loading: false, receivedAt: new Date().toISOString(),
        }))
      } catch (error) {
        if (!cancelled) setResult((current) => ({ ...current, loading: false, error: error.message || 'Could not reach the API.' }))
      } finally { inFlight = false }
    }
    const connectStream = () => {
      if (cancelled || document.hidden || typeof WebSocket === 'undefined') return
      const streamUrl = `${baseUrl.replace(/^http/i, 'ws').replace(/\/+$/, '')}/stream`
      const startedAt = performance.now()
      try {
        const connection = new WebSocket(streamUrl)
        socket = connection
        connection.onopen = () => {
          if (cancelled) return
          setResult((current) => ({ ...current, streamConnected: true }))
          recordRequest({ method: 'WS', path: '/stream', status: 'OPEN', latencyMs: Math.round(performance.now() - startedAt), payload: { connected: true, note: 'WebSocket handshake succeeded; state messages stream at 5 Hz.' }, mode: 'live' })
        }
        connection.onmessage = (message) => {
          if (cancelled) return
          try {
            const state = JSON.parse(message.data)
            setResult((current) => current.data ? ({
              ...current,
              data: {
                ...current.data,
                state: { ...current.data.state, ...state },
                health: { ...current.data.health, messages_received: state.total_messages ?? current.data.health?.messages_received },
              },
            }) : current)
          } catch { /* Ignore malformed stream messages; REST remains available. */ }
        }
        connection.onclose = () => {
          if (cancelled || document.hidden) return
          setResult((current) => ({ ...current, streamConnected: false }))
          reconnectTimer = window.setTimeout(connectStream, 3000)
        }
        connection.onerror = () => connection.close()
      } catch {
        reconnectTimer = window.setTimeout(connectStream, 3000)
      }
    }
    refresh()
    connectStream()
    const timer = window.setInterval(refresh, 2200)
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearTimeout(reconnectTimer)
        socket?.close()
        setResult((current) => ({ ...current, streamConnected: false }))
      } else {
        refresh()
        connectStream()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.clearTimeout(reconnectTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      socket?.close()
    }
  }, [mode, baseUrl, recordRequest])
  return { ...result, recordRequest }
}

export function LiveTwinDashboard() {
  const simulation = useLiveSimulation()
  const { source, running, started, naturalAnomalies, speedMultiplier, frames, scores, alerts, cars, carFaults, carDecisions, scoresByCar, autoFaultPending, autoFaultAt, simulationTime } = simulation
  const [apiUrl, setApiUrl] = useState(apiUrlFromStorage)
  const [apiDraft, setApiDraft] = useState(apiUrlFromStorage)
  const [apiAddressError, setApiAddressError] = useState('')
  const [selectedId, setSelectedId] = useState('project')
  const [followCar, setFollowCar] = useState(false)
  const [developerOpen, setDeveloperOpen] = useState(false)
  const mode = source === 'browser' ? 'simulated' : 'live'
  const isSimulated = source === 'browser'
  const live = useLiveApi(isSimulated ? 'simulated' : 'live', apiUrl)
  const selectedCar = SIM_CARS.find((car) => car.id === selectedId) || SIM_CARS[0]
  const selectedIsLive = !isSimulated && selectedId === 'project'
  const liveFrameCount = Math.max(Number(live.data?.health?.messages_received || 0), Number(live.data?.state?.total_messages || 0))
  const liveHasFrames = liveFrameCount > 0
  const selectedState = selectedIsLive ? (liveHasFrames ? live.data?.state || null : null) : cars.find((car) => car.id === selectedId)?.state || null
  const selectedFault = !selectedIsLive ? carFaults?.[selectedId] || null : null
  const selectedDecision = !selectedIsLive ? carDecisions?.[selectedId] : null
  const selectedFrames = !selectedIsLive ? frames.filter((frame) => frame.carId === selectedId).slice(0, 36) : []
  const displayEvents = selectedIsLive ? live.data?.events || [] : isSimulated ? alerts : alerts.filter((event) => event.carId === selectedId)
  const selectedMode = selectedIsLive ? 'live' : 'simulated'
  const scorePoints = isSimulated ? scores : (live.data?.events || []).slice().reverse().map((event) => ({ time: event.timestamp, score: Number(event.score) }))
  const selectedScores = !selectedIsLive ? scoresByCar?.[selectedId] || scores : scorePoints
  const latestDetectedAlert = isSimulated ? alerts.find((alert) => alert.carId === 'project') : null
  const demoFaultCountdown = autoFaultPending ? Math.max(0, Math.ceil((autoFaultAt - simulationTime) / 1000)) : 0
  const modeLabel = isSimulated
    ? `SIMULATED · ${!started ? 'IDLE' : running ? 'RUNNING' : 'PAUSED'}`
    : live.error ? 'BACKEND OFFLINE'
      : !live.data ? 'BACKEND CONNECTING'
        : live.data.health?.bus_connected === false ? 'BACKEND · NO BUS'
          : !liveHasFrames ? 'BACKEND · NO ECU FRAMES'
            : 'BACKEND CONNECTED'
  useEffect(() => {
    if (!developerOpen) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setDeveloperOpen(false) }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [developerOpen])

  useEffect(() => {
    try { window.localStorage.setItem('can-notes-api-url', apiUrl) } catch { /* Storage may be disabled. */ }
  }, [apiUrl])

  const connectApi = (event) => {
    event.preventDefault()
    const normalized = apiDraft.trim().replace(/\/+$/, '')
    try {
      const parsed = new URL(normalized)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS address.')
      setApiAddressError('')
      setApiUrl(normalized)
      simulation.selectSource('backend')
    } catch {
      setApiAddressError('Enter a full address, for example http://localhost:8000.')
    }
  }

  const carStates = useMemo(() => cars.map((car, index) => ({
    ...car,
    state: !isSimulated && car.id === 'project' ? (liveHasFrames ? live.data?.state || null : null) : car.state,
    live: !isSimulated && car.id === 'project' && liveHasFrames && !live.error,
    apiSelected: !isSimulated && car.id === 'project',
    project: car.id === 'project',
    routeIndex: index,
    apiLabel: live.error ? 'API OFFLINE' : !live.data ? 'CONNECTING' : !liveHasFrames ? 'WAITING FOR CAN' : 'LIVE PROJECT',
  })), [cars, isSimulated, live.data, live.error, liveHasFrames])
  const mapStarted = isSimulated ? started : liveHasFrames
  const mapRunning = isSimulated ? running : liveHasFrames

  return <section className="section twin-section" id="fleet" aria-labelledby="fleet-title">
    <div className="section-heading twin-heading">
      <div><p className="eyebrow">FIELD NOTE 02 <span>—</span> THE FLEET VIEW</p><h2 id="fleet-title">A small fleet.<br />One test bench.</h2></div>
      <p className="section-intro">The highlighted project car is the browser CAN tester: its Engine, Brake and Speed readings are packed into frames, scored by the simulated detector, and its Speed ECU drives its map movement. The other three cars are simulated traffic for comparison; they are not extra project ECUs.</p>
    </div>

    <div className="mode-console">
      <div className="mode-intro mode-status-chip" role="status" aria-live="polite"><span className={`mode-lamp ${isSimulated ? 'lamp-sim' : liveHasFrames && !live.error ? 'lamp-live' : 'lamp-off'}`} /><strong>{modeLabel}</strong></div>
      <div className="mode-switch" role="group" aria-label="Data mode">
        <button className={isSimulated ? 'selected' : ''} aria-pressed={isSimulated} onClick={() => simulation.selectSource('browser')}>Simulated (browser)</button>
        <button className={!isSimulated ? 'selected' : ''} aria-pressed={!isSimulated} onClick={() => simulation.selectSource('backend')}>Live backend</button>
      </div>
      <button className="developer-drawer-trigger" type="button" onClick={() => setDeveloperOpen(true)} aria-haspopup="dialog" aria-expanded={developerOpen}><Code2 size={14} /> Developer / API</button>
      {isSimulated && <div className="browser-simulation-controls" aria-label="Browser simulation controls">
        <div className="simulation-actions">
          <button className="sim-action-start" onClick={simulation.start} disabled={running}><Play size={14} /> {started ? 'Resume' : 'Start · alert around 10s'}</button>
          <button className="sim-action-pause" onClick={simulation.pause} disabled={!running}><Pause size={14} /> Pause</button>
          <button className="sim-action-reset" onClick={simulation.reset}><RotateCcw size={14} /> Reset</button>
        </div>
        <label className="simulation-speed"><span>SIM SPEED <strong>{speedMultiplier.toFixed(1)}×</strong></span><input type="range" min="0.5" max="4" step="0.5" value={speedMultiplier} onChange={(event) => simulation.setSpeedMultiplier(event.target.value)} aria-label="Simulation speed from half speed to four times speed" /><small>0.5×</small><small>4×</small></label>
        {(autoFaultPending || !started) && <p className="tester-start-note">{autoFaultPending ? `Normal readings first · automatic RPM fault in about ${demoFaultCountdown}s of simulation time.` : 'Start begins with normal readings. The project car gets one simulated RPM fault after about 10 seconds; the detector must score it before an alert appears.'}</p>}
      </div>}
    </div>

    {latestDetectedAlert && <div className="detected-alert-banner" role="status" aria-live="polite">
      <div className="detected-alert-mark"><AlertTriangle size={17} /></div>
      <div className="detected-alert-copy"><span className="mono-label">DETECTOR FLAGGED · PROJECT CAN TESTER · SIMULATED</span><strong>{latestDetectedAlert.diagnosis}</strong><p>{formatTimestamp(latestDetectedAlert.timestamp)} · {latestDetectedAlert.ecu} ECU · {latestDetectedAlert.signal}: {latestDetectedAlert.value} · score {Number(latestDetectedAlert.score).toFixed(3)} (threshold 0)</p></div>
      <button type="button" onClick={() => simulation.clearFault(latestDetectedAlert.carId || 'project')}>Clear fault</button>
    </div>}

    <div className="fleet-layout">
      <div className="fleet-map-panel">
        <div className="panel-heading fleet-map-heading"><div><span className="mono-label">SIMULATED ROUTE · NOT GPS DATA</span><h3>GITAM campus, Visakhapatnam</h3></div><label className="follow-toggle"><input type="checkbox" checked={followCar} onChange={(event) => setFollowCar(event.target.checked)} /> <span>Follow car</span></label></div>
        <FleetMap cars={carStates} selectedId={selectedId} onSelect={setSelectedId} running={mapRunning} started={mapStarted} speedMultiplier={speedMultiplier} follow={followCar} simulationTime={simulation.simulationTime} />
        <div className="map-legend"><span><i className="legend-project" /> project CAN tester</span><span><i className="legend-sim" /> simulated fleet</span><span><i className="legend-fault" /> fault detected</span><span className="map-north">{mapStarted ? mapRunning ? 'SIM RUNNING' : 'SIM PAUSED' : 'PARKED · IDLE'}</span></div>
      </div>
      <div className="selected-car-panel">
        <div className="panel-heading"><span className="mono-label">SELECTED VEHICLE</span><span className={`selection-mode ${selectedIsLive ? 'selection-live' : 'selection-sim'}`}>{selectedIsLive ? 'LIVE LINK' : 'SIMULATED'}</span></div>
        <div className="selected-vehicle-title"><span className="vehicle-id">{selectedCar.callsign}</span><h3>{selectedCar.name}</h3></div>
        {selectedId === 'project' && <p className="tester-role-note"><strong>CAN test vehicle</strong> — the three ECU readings below create frames 0x100, 0x200 and 0x300. The detector evaluates those same readings, while Speed ECU output sets this car’s simulated road speed. Other cars are comparison traffic only.</p>}
        {selectedState ? <VehicleSummary state={selectedState} live={selectedIsLive} simulationRunning={running} decision={selectedDecision} fault={selectedFault} /> : isSimulated ? <IdleVehicleSummary onStart={simulation.start} /> : <div className="no-live-state"><WifiOff size={18} /><p>Live readings are unavailable until the API connects.</p><span>Use browser simulation for an offline demo.</span></div>}
        <div className="selected-meta"><span className="mono-label">FRAME IDs</span><strong>{selectedState ? '100 · 200 · 300' : '—'}</strong><span className="mono-label">LAST UPDATE</span><strong>{selectedState?.last_update ? formatDate(selectedState.last_update) : selectedIsLive ? live.data ? `Waiting for ECU frames · ${liveFrameCount} received` : 'Waiting for API data' : started ? 'Waiting for simulation' : 'Simulation not started'}</strong></div>
      </div>
    </div>

    <div className="telemetry-toolbar">
      <div><span className="eyebrow">VEHICLE TELEMETRY</span><h3>{selectedCar.name} <span>{selectedIsLive ? '· LIVE BACKEND' : isSimulated ? '· SIMULATED (BROWSER)' : '· FLEET DEMO'}</span></h3></div>
      {selectedIsLive && <div className="read-only-note"><CircleHelp size={14} /> Current API exposes decoded state; this page does not inject faults into the backend.</div>}
    </div>
    {isSimulated && <section className="fault-control-panel" aria-labelledby="fault-controls-title">
      <div className="fault-control-heading"><div><span className="mono-label">BROWSER FAULT INJECTION</span><h3 id="fault-controls-title">Send a fault through {selectedCar.callsign}</h3></div><span className="panel-state state-sim">SIMULATED DETECTOR</span></div>
      <label className="natural-anomaly-toggle"><input type="checkbox" checked={naturalAnomalies} onChange={(event) => simulation.setNaturalAnomalies(event.target.checked)} /><span>Allow rare natural glitches</span><small>OFF by default · simulated detector may flag a brief sensor spike</small></label>
      <div className="browser-fault-buttons" role="group" aria-label={`Inject a simulated ECU fault into ${selectedCar.callsign}`}>{BROWSER_FAULTS.map((item) => <button key={item.id} className={selectedFault === item.id ? 'fault-button-active' : ''} aria-pressed={selectedFault === item.id} onClick={() => simulation.injectFault(item.id, selectedId)}><span>{item.label}</span><small>{item.ecu}</small></button>)}</div>
      <div className="browser-fault-note"><p>{selectedFault ? `${BROWSER_FAULTS.find((item) => item.id === selectedFault)?.label} active on ${selectedCar.callsign}. The simulated detector must score its readings before an alert appears.` : 'A fresh run starts with normal readings; an automatic RPM spike is scheduled about 10 simulation seconds later. You can also select another fault here; alerts only appear after the simulated detector flags the reading.'}</p>{selectedFault && <button className="clear-fault-button" onClick={() => simulation.clearFault(selectedId)}>Clear fault</button>}</div>
    </section>}
    {selectedIsLive && !selectedState ? <div className="telemetry-offline"><WifiOff size={18} /><span>{live.data ? 'FastAPI is reachable; waiting for the ECU simulators to send frames.' : 'Connect to the FastAPI service to see live values, or switch to simulated mode.'}</span></div> : <EcuReadings state={selectedState} mode={selectedIsLive ? 'live' : 'simulated'} started={selectedIsLive ? Boolean(selectedState) : started} onStart={simulation.start} />}
    {(selectedState || isSimulated) && <ReadingGuide live={selectedIsLive} />}

    <div className="monitor-grid">
      <CanFeed mode={selectedMode} frames={selectedFrames} selectedCar={selectedCar} started={selectedIsLive ? liveHasFrames : started} onStart={simulation.start} />
      <AnomalyPlot mode={selectedMode} points={selectedScores} started={selectedIsLive ? liveHasFrames : started} onStart={simulation.start} />
      <AlertsPanel mode={selectedMode} events={displayEvents} onClear={(carId) => simulation.clearFault(carId)} onStart={simulation.start} started={started} />
      <EcuHealth mode={mode} api={live.data} apiError={live.error} started={started} />
    </div>
    {!selectedIsLive ? <p className="api-limit-note"><Radio size={14} /> These readings, CAN-style bytes, and routes are simulated. The browser detector is a threshold approximation, not Python Isolation Forest output; the stuck-speed rule is browser-only.</p> : <p className="api-limit-note"><Radio size={14} /> Live API exposes decoded values, per-ECU last-frame times, and anomaly events. It does not expose raw CAN frames, GPS positions, or a continuous score history.</p>}
    {developerOpen && <div className="api-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeveloperOpen(false) }}><aside className="api-drawer" role="dialog" aria-modal="true" aria-labelledby="api-drawer-title"><div className="api-drawer-top"><div><span className="mono-label">DEVELOPER TOOLS</span><h3 id="api-drawer-title">API console</h3></div><button autoFocus type="button" className="api-drawer-close" onClick={() => setDeveloperOpen(false)} aria-label="Close API console"><X size={17} /></button></div>
      {!isSimulated && <form className="api-connect drawer-api-connect" onSubmit={connectApi}>
        <label className="api-address"><span>FASTAPI BASE ADDRESS</span><input type="url" value={apiDraft} onChange={(event) => setApiDraft(event.target.value)} placeholder="http://localhost:8000" aria-label="FastAPI base URL" aria-describedby="api-address-help api-address-error" /></label>
        <button className="connect-button" type="submit">Connect / retry</button>
        <p className="api-address-help" id="api-address-help">Run FastAPI on Linux/WSL with vcan0, all three ECUs, and the trained model. Browser simulation needs none of those.</p>
        <p className="api-address-error" id="api-address-error" role="status">{apiAddressError}</p>
      </form>}
      <ApiConsole mode={mode} apiUrl={apiUrl} simulation={simulation} logs={live.logs} counts={live.counts} recordRequest={live.recordRequest} streamConnected={live.streamConnected} backendError={isSimulated ? '' : live.error} /></aside></div>}
  </section>
}

function VehicleSummary({ state, live, simulationRunning, decision, fault }) {
  return <div className="summary-gauges">
    <div className="summary-gauge"><span className="mono-label">SPEED</span><strong>{formatMetric(state.speed?.speed, 1)}</strong><small>km/h</small><div className="gauge-line"><i style={{ width: `${clamp(state.speed?.speed / 1.2, 0, 100)}%` }} /></div></div>
    <div className="summary-gauge"><span className="mono-label">ENGINE</span><strong>{formatMetric(state.engine?.rpm, 0)}</strong><small>rpm</small><div className="gauge-line amber-line"><i style={{ width: `${clamp(state.engine?.rpm / 80, 0, 100)}%` }} /></div></div>
    <div className={`summary-anomaly ${decision?.anomalous ? 'is-anomalous' : ''}`}><span className="mono-label">ANOMALY SCORE</span><strong>{decision?.score == null ? '—' : Number(decision.score).toFixed(3)}</strong><small>{decision?.anomalous ? decision.diagnosis : fault ? 'Evaluating injected fault' : 'Normal reading'}</small></div>
    <p className="summary-source">{live ? 'Live decoded values. Route and marker position remain simulated.' : simulationRunning ? 'Browser generated · updating with the shared simulation.' : 'Browser generated · simulation paused.'}</p>
  </div>
}

function IdleVehicleSummary({ onStart }) {
  return <div className="summary-gauges idle-summary">
    <div className="summary-gauge"><span className="mono-label">SPEED</span><strong>—</strong><small>km/h</small><div className="gauge-line"><i style={{ width: '0%' }} /></div></div>
    <div className="summary-gauge"><span className="mono-label">ENGINE</span><strong>—</strong><small>rpm</small><div className="gauge-line amber-line"><i style={{ width: '0%' }} /></div></div>
    <div className="summary-anomaly"><span className="mono-label">ANOMALY SCORE</span><strong>—</strong><small>No readings</small></div>
    <p className="summary-source">Simulation not started · no readings generated.</p>
    <button type="button" className="idle-summary-start" onClick={onStart}>Start simulation</button>
  </div>
}

function EcuReadings({ state, mode, started, onStart }) {
  return <div className="ecu-grid">
    {ECU_INFO.map(({ key, label, id, icon: Icon, signals }, index) => {
      const values = state?.[key] || {}
      const ecuLastUpdate = state?.ecu_last_update?.[key]
      const ecuFresh = ecuLastUpdate && Date.now() - new Date(ecuLastUpdate).getTime() < 5000
      return <article className={`ecu-instrument ecu-${key}`} key={key}>
        <div className="ecu-heading"><div className="ecu-icon"><Icon size={17} /></div><div><span className="mono-label">{label}</span><strong>{id}</strong></div><span className={`ecu-link ${mode === 'simulated' ? 'link-sim' : 'link-api'}`}><i />{!started ? 'IDLE' : mode === 'simulated' ? 'SIM' : 'API'}</span></div>
        <div className={`ecu-values ${!started ? 'ecu-values-idle' : ''}`}>{signals.map(([field, name, unit]) => <div className="ecu-value" key={field}><span>{name}</span><strong>{!started ? '—' : field === 'abs_status' ? (Number(values[field]) ? 'ON' : 'OFF') : formatMetric(values[field], field === 'rpm' || field === 'throttle' || field === 'pedal_position' ? 0 : 1)}<small>{unit}</small></strong></div>)}</div>
        <div className="ecu-bottom"><span>{mode === 'simulated' ? 'SIMULATED SOURCE' : 'LAST ECU FRAME'}</span><span>{!started ? 'PARKED · NO FRAMES' : mode === 'simulated' ? `NODE 0${index + 1} · ACTIVE` : ecuFresh ? formatDate(ecuLastUpdate) : ecuLastUpdate ? 'STALE' : 'WAITING'}</span></div>
      </article>
    })}
    {!started && <div className="ecu-idle-note"><span>Simulation not started · no readings generated.</span>{mode === 'simulated' && <button type="button" onClick={onStart}>Start</button>}</div>}
  </div>
}

function ReadingGuide({ live }) {
  return <details className="reading-guide">
    <summary>What do these readings mean?</summary>
    <div className="reading-guide-body">
      <p><strong>RPM</strong> is engine speed. <strong>Coolant</strong> is degrees Celsius. <strong>Throttle</strong> and <strong>pedal</strong> are percentages. <strong>Pressure</strong> is brake pressure in bar. <strong>ABS</strong> is the simulated brake ECU status. <strong>Vehicle / wheel speed</strong> is km/h.</p>
      {live ? <p>These are decoded values returned by FastAPI. Each ECU card shows the last time a recognized frame arrived from that ECU. A waiting or stale label means that ECU is not sending recently.</p> : <p><strong>Browser simulation:</strong> synthetic signals update on a 125 ms simulation step, scaled by the speed control. Normal RPM (800–3,500), coolant (80–105 °C), throttle (0–80%), speed (0–120 km/h), and closely matched wheel speeds follow the project's training ranges. Braking raises pedal position and pressure together. These are generated values, not vehicle measurements.</p>}
    </div>
  </details>
}

function CanFeed({ mode, frames, selectedCar, started, onStart }) {
  return <article className="monitor-panel can-feed-panel">
    <div className="panel-heading"><div><span className="mono-label">BUS OBSERVATION · {selectedCar.callsign}</span><h3>CAN message feed</h3></div><span className={`panel-state ${mode === 'simulated' ? 'state-sim' : 'state-unavailable'}`}>{mode === 'simulated' ? 'SIMULATED' : 'NOT EXPOSED'}</span></div>
    {mode === 'live' ? <div className="panel-empty"><Radio size={18} /><p>The current API returns decoded vehicle state, not the original CAN frames.</p><span>Raw live feed needs a backend endpoint.</span></div> : <div className="frame-list">{frames.length ? frames.map((frame) => <div className={`frame-row ${frame.fault ? 'frame-fault' : ''}`} key={frame.id}><time>{frame.time}</time><strong>{frame.ecu}</strong><code>{frame.canId}</code><span className="frame-dlc">DLC {frame.dlc}</span><code className="frame-bytes">{frame.bytes.join(' ')}</code></div>) : <div className="panel-empty"><Radio size={18} /><p>{started ? 'Waiting for the first ECU frames.' : 'Simulation not started'}</p>{!started && <><span>No CAN frames have been generated.</span><button type="button" className="empty-start-button" onClick={onStart}>Start simulation</button></>}</div>}</div>}
  </article>
}

function AnomalyPlot({ mode, points, started, onStart }) {
  const valid = points.filter((item) => Number.isFinite(item.score))
  const width = 520, height = 174, left = 39, right = 12, top = 15, bottom = 27
  const extent = Math.max(.2, ...valid.map((item) => Math.abs(item.score)))
  const plotY = (value) => top + ((extent - value) / (extent * 2)) * (height - top - bottom)
  const coords = valid.map((item, index) => ({ x: left + (valid.length < 2 ? 0 : (index / (valid.length - 1)) * (width - left - right)), y: plotY(item.score), item }))
  const line = coords.map(({ x, y }, index) => `${index ? 'L' : 'M'}${x},${y}`).join(' ')
  return <article className="monitor-panel score-panel">
    <div className="panel-heading"><div><span className="mono-label">{mode === 'simulated' ? 'SIMULATED DETECTOR' : 'RECORDED ANOMALY EVENTS'}</span><h3>{mode === 'simulated' ? 'Score proxy' : 'Event scores'}</h3></div><span className={`panel-state ${mode === 'simulated' ? 'state-sim' : 'state-live'}`}>{mode === 'simulated' ? 'RULE APPROXIMATION' : 'API DATA'}</span></div>
    {!valid.length ? <div className="panel-empty"><Activity size={18} /><p>{mode === 'simulated' && !started ? 'Simulation not started' : 'No anomaly scores yet'}</p><span>{mode === 'live' ? 'The API only keeps scores for flagged events; normal-frame scores are not available.' : started ? 'The score trace will fill as simulated ECU readings arrive.' : 'Start the simulation to generate a score trace.'}</span>{mode === 'simulated' && !started && <button type="button" className="empty-start-button" onClick={onStart}>Start simulation</button>}</div> : <>
      <svg className="score-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mode === 'simulated' ? 'Clearly simulated anomaly score trace around a zero threshold' : 'Scores returned for recorded anomaly events'}>
        {[extent, extent / 2, 0, -extent / 2, -extent].map((value) => <g key={value}><line x1={left} x2={width-right} y1={plotY(value)} y2={plotY(value)} className={value === 0 ? 'score-threshold' : 'score-gridline'} /><text x="4" y={plotY(value)+3} className="score-axis">{value.toFixed(2)}</text></g>)}
        {coords.length > 1 && <path d={line} className="score-line" />}
        {coords.map(({ x, y, item }, index) => <g key={`${item.time}-${index}`}><circle cx={x} cy={y} r="3.5" className={item.score < 0 ? 'score-dot score-alert' : 'score-dot'}><title>{`${item.time || 'sample'} · decision score ${Number(item.score).toFixed(3)}`}</title></circle></g>)}
        <text x={left} y={height-5} className="score-axis">EARLIER</text><text x={width-right-39} y={height-5} className="score-axis">LATEST</text>
      </svg>
      <p className="chart-caption">{mode === 'simulated' ? 'Simplified rule-based proxy, not Isolation Forest output. It uses the project’s normal ranges and explicit diagnosis cutoffs; zero separates its demo normal/anomaly scores.' : 'Event scores only · zero decision boundary · no full time-series endpoint.'}</p>
    </>}
  </article>
}

function AlertsPanel({ mode, events, onClear, onStart, started }) {
  return <article className="monitor-panel alerts-panel">
    <div className="panel-heading"><div><span className="mono-label">DETECTOR OUTPUT</span><h3>Fault alerts</h3></div><span className={`panel-state ${mode === 'simulated' ? 'state-sim' : 'state-live'}`}>{mode === 'simulated' ? 'SIMULATED' : 'API EVENTS'}</span></div>
    {!events.length ? <div className="panel-empty"><p>No faults detected</p><span>{mode === 'simulated' ? !started ? 'Simulation not started. Start it to monitor ECU readings.' : 'The simulated detector is within its normal band.' : 'No anomaly events have been reported by the API.'}</span>{mode === 'simulated' && !started && <button type="button" className="empty-start-button" onClick={onStart}>Start simulation</button>}</div> : <div className="alerts-list">{events.slice(0,5).map((event, index) => <div className="alert-row" key={`${event.timestamp}-${index}`}><div className="alert-icon"><AlertTriangle size={15} /></div><div className="alert-copy"><strong>{event.diagnosis}</strong><span>{event.carId ? `${SIM_CARS.find((car) => car.id === event.carId)?.callsign || event.carId} · ` : ''}{formatTimestamp(event.timestamp)} · {event.ecu || 'ECU'} · {event.signal || 'signal'}: {event.value ?? '—'} · {Number.isFinite(Number(event.score)) ? Number(event.score).toFixed(3) : 'score unavailable'}{mode === 'simulated' ? ' · simulated' : ''}</span></div>{mode === 'simulated' && <button type="button" className="alert-clear" onClick={() => onClear(event.carId)} aria-label={`Clear fault on ${event.carId}`}>Clear fault</button>}</div>)}</div>}
  </article>
}

function EcuHealth({ mode, api, apiError, started }) {
  const health = api?.health
  const state = api?.state
  const connected = Boolean(api && !apiError && health?.bus_connected !== false)
  const liveCount = Number(health?.messages_received ?? state?.total_messages ?? 0)
  return <article className="monitor-panel ecu-health-panel">
    <div className="panel-heading"><div><span className="mono-label">NODE STATUS</span><h3>ECU links</h3></div><span className={`panel-state ${mode === 'simulated' ? 'state-sim' : connected && liveCount ? 'state-live' : 'state-unavailable'}`}>{mode === 'simulated' ? 'SIMULATED' : !api ? 'NO LINK' : health?.bus_connected === false ? 'VCAN0 OFFLINE' : liveCount ? 'FRAMES RECEIVED' : 'WAITING FOR FRAMES'}</span></div>
    <div className="ecu-health-list">{ECU_INFO.map((ecu) => {
      const lastSeen = state?.ecu_last_update?.[ecu.key]
      const fresh = lastSeen && Date.now() - new Date(lastSeen).getTime() < 5000
      const linkState = mode === 'simulated' ? started ? 'ACTIVE · DEMO' : 'IDLE · NO FRAMES' : !connected ? 'UNAVAILABLE' : fresh ? `LAST FRAME · ${formatDate(lastSeen)}` : lastSeen ? 'STALE · NO RECENT FRAME' : 'WAITING · NO FRAME YET'
      return <div className="ecu-health-row" key={ecu.key}><span className={`health-indicator ${mode === 'simulated' ? 'health-sim' : !connected ? 'health-off' : fresh ? 'health-unknown' : 'health-waiting'}`} /><span>{ecu.label}</span><code>{ecu.id}</code><strong>{linkState}</strong></div>
    })}</div>
    {mode === 'live' && health?.model_loaded === false && <p className="health-footnote">CAN can be connected while anomaly detection is unavailable. Train the model and restart FastAPI.</p>}
    {mode === 'live' && health?.listener_error && <p className="health-footnote">Last CAN listener error: {health.listener_error}</p>}
  </article>
}

function formatMetric(value, decimals = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)) }
