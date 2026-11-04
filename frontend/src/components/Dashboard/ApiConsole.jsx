import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CircleHelp, Play, Radio } from 'lucide-react'
import { requestTwinEndpoint } from '../../services/api.js'

const GET_ENDPOINTS = [
  { path: '/', method: 'GET', purpose: 'Service name, version, and endpoint index' },
  { path: '/health', method: 'GET', purpose: 'CAN listener, model, and detector readiness' },
  { path: '/state', method: 'GET', purpose: 'Latest decoded readings from all three ECUs' },
  { path: '/anomalies?limit=30', method: 'GET', purpose: 'Most recent stored detector events' },
]
const WS_ENDPOINT = { path: '/stream', method: 'WS', purpose: 'Vehicle state stream at 5 Hz' }
const toPathKey = (path) => path.split('?')[0]

function simulatedPayload(path, simulation) {
  if (path === '/') return { service: 'Vehicle Digital Twin API', version: '1.0.0', endpoints: ['/state', '/anomalies', '/health', '/stream'], source: 'SIMULATED API · BROWSER ONLY' }
  if (path === '/health') return { status: 'simulated', source: 'in-browser simulation', listener_status: simulation.started ? 'synthetic' : 'idle', bus_connected: null, model_loaded: false, detection_ready: simulation.started, messages_received: simulation.frames.length, anomalies_detected: simulation.alerts.length, note: 'No FastAPI service was contacted.' }
  if (path === '/state') return simulation.started ? { ...simulation.vehicle, last_update: simulation.vehicle.last_update, ecu_last_update: { engine: 'simulated', brake: 'simulated', speed: 'simulated' }, total_messages: simulation.frames.length, total_anomalies: simulation.alerts.length, source: 'SIMULATED API · BROWSER ONLY' } : { status: 'idle', state: null, source: 'SIMULATED API · BROWSER ONLY', note: 'Simulation has not started; no readings exist.' }
  return { total: simulation.alerts.length, events: simulation.alerts.slice(0, 30), source: 'SIMULATED API · BROWSER ONLY' }
}

function JsonCode({ value }) {
  const tokens = JSON.stringify(value ?? null, null, 2).split(/("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g).filter((part) => part !== '')
  return <pre className="api-json"><code>{tokens.map((token, index) => {
    const type = token.startsWith('"') ? (/:$/.test(token) ? 'json-key' : 'json-string') : /^(true|false|null)$/.test(token) ? 'json-literal' : /^-?\d/.test(token) ? 'json-number' : 'json-punctuation'
    return <span className={type} key={index}>{token}</span>
  })}</code></pre>
}

function FlowStrip({ mode, requestId }) {
  const pieces = ['BROWSER', mode === 'simulated' ? 'SIMULATED API' : 'FASTAPI', mode === 'simulated' ? 'SIMULATED DETECTOR' : 'ML MODEL', 'RESPONSE']
  return <div className="api-flow-strip" aria-label="Data flow: browser to API to ML model to response">
    {pieces.map((piece, index) => <span key={piece}><b key={`${requestId}-${piece}`} className="api-flow-node">{piece}</b>{index < pieces.length - 1 && <i className="api-flow-arrow"><ArrowRight size={13} /></i>}</span>)}
  </div>
}

export function ApiConsole({ mode, apiUrl, simulation, logs, counts = {}, recordRequest, streamConnected, backendError }) {
  const simulationRef = useRef(simulation)
  const [selectedPath, setSelectedPath] = useState('/health')
  const [tryResult, setTryResult] = useState(null)
  const [trying, setTrying] = useState(false)
  const [serial, setSerial] = useState(0)
  simulationRef.current = simulation
  const isSimulated = mode === 'simulated'
  const newestRequestId = logs[0]?.id || `idle-${serial}`

  useEffect(() => {
    if (!isSimulated) return undefined
    const emitSnapshot = () => {
      if (document.hidden) return
      const state = simulationRef.current
      if (!state.started) return
      GET_ENDPOINTS.slice(1).forEach(({ path }) => recordRequest({
        method: 'GET', path, status: 'SIMULATED', latencyMs: 0,
        payload: simulatedPayload(path, state), mode: 'simulated', id: `${Date.now()}-${Math.random()}`,
      }))
    }
    emitSnapshot()
    const timer = window.setInterval(emitSnapshot, 2200)
    return () => window.clearInterval(timer)
  }, [isSimulated, recordRequest])

  const stats = useMemo(() => {
    const byPath = new Map()
    logs.forEach((entry) => {
      const key = toPathKey(entry.path)
      const item = byPath.get(key) || { count: 0, latest: null }
      item.count += 1
      if (!item.latest) item.latest = entry
      byPath.set(key, item)
    })
    return byPath
  }, [logs])

  const tryEndpoint = async (path) => {
    setSelectedPath(path)
    setTrying(true)
    setTryResult(null)
    if (isSimulated) {
      const result = { method: 'GET', path, status: 'SIMULATED', latencyMs: 0, payload: simulatedPayload(path, simulationRef.current), mode: 'simulated' }
      recordRequest(result)
      setTryResult(result)
    } else {
      const result = await requestTwinEndpoint(apiUrl, path, recordRequest)
      setTryResult(result)
    }
    setSerial((number) => number + 1)
    setTrying(false)
  }

  const endpointStatus = (path) => {
    if (isSimulated) return 'SIMULATED'
    const latest = stats.get(toPathKey(path))?.latest
    if (!latest) return backendError ? 'OFFLINE' : 'WAITING'
    return latest.status || 'OFFLINE'
  }
  const toneFor = (status) => status === 'SIMULATED' ? 'api-status-sim' : status === 'OFFLINE' || Number(status) >= 400 ? 'api-status-off' : status === 'WAITING' ? 'api-status-wait' : 'api-status-ok'

  return <section className="api-console" aria-labelledby="api-console-title">
    <div className="api-console-heading"><div><span className="mono-label">REQUEST INSPECTOR</span><h3 id="api-console-title">API console</h3><p>These are the routes FastAPI actually serves. Dashboard polls use three GET endpoints; the stream is a separate WebSocket.</p></div><span className={`api-mode-badge ${isSimulated ? 'badge-sim' : backendError ? 'badge-off' : 'badge-live'}`}>{isSimulated ? 'SIMULATED API' : backendError ? 'BACKEND OFFLINE' : 'LIVE BACKEND'}</span></div>
    <FlowStrip mode={mode} requestId={newestRequestId} />
    {!isSimulated && backendError && <p className="api-offline-note"><Radio size={14} /> Backend offline: {backendError} No response is being fabricated.</p>}
    <div className="api-console-grid">
      <div className="api-endpoint-list">
      <div className="api-subhead"><span>ENDPOINT</span><span>STATUS</span><span>RESPONSE · CALLS</span></div>
        {GET_ENDPOINTS.map((endpoint) => {
          const statsForPath = stats.get(toPathKey(endpoint.path))
          const status = endpointStatus(endpoint.path)
          return <article className="api-endpoint-row" key={endpoint.path}>
            <div className="api-endpoint-info"><button onClick={() => tryEndpoint(endpoint.path)} title={`Try ${endpoint.path}`}>{endpoint.method} <code>{endpoint.path}</code></button><small>{endpoint.purpose}</small></div>
            <span className={`api-status ${toneFor(status)}`}>{status}</span>
            <span className="api-endpoint-metrics">{isSimulated ? 'LOCAL' : `${statsForPath?.latest?.latencyMs ?? '—'} ms`} · {statsForPath?.latest?.timestamp ? new Date(statsForPath.latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}<br /><small>{counts[toPathKey(endpoint.path)] || 0} {isSimulated ? 'local' : 'total'} calls</small></span>
          </article>
        })}
        <article className="api-endpoint-row api-ws-row"><div className="api-endpoint-info"><span>WS <code>/stream</code></span><small>{WS_ENDPOINT.purpose}</small></div><span className={`api-status ${toneFor(isSimulated ? 'SIMULATED' : streamConnected ? 'OPEN' : backendError ? 'OFFLINE' : 'WAITING')}`}>{isSimulated ? 'SIMULATED' : streamConnected ? 'OPEN' : backendError ? 'OFFLINE' : 'WAITING'}</span><span className="api-endpoint-metrics">{isSimulated ? '—' : stats.get('/stream')?.latest?.latencyMs ?? '—'} ms · {stats.get('/stream')?.latest?.timestamp ? new Date(stats.get('/stream').latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}<br /><small>{isSimulated ? 'local twin state' : `${counts['/stream'] || 0} connections`}</small></span></article>
      </div>
      <div className="api-try-panel">
        <div className="api-try-head"><div><span className="mono-label">TRY IT</span><strong>Inspect one GET response</strong></div><CircleHelp size={15} /></div>
        <label htmlFor="try-api-endpoint">Existing endpoint</label>
        <div className="api-try-controls"><select id="try-api-endpoint" value={selectedPath} onChange={(event) => setSelectedPath(event.target.value)}>{GET_ENDPOINTS.map((endpoint) => <option key={endpoint.path} value={endpoint.path}>{endpoint.method} {endpoint.path}</option>)}</select><button onClick={() => tryEndpoint(selectedPath)} disabled={trying}><Play size={13} /> {trying ? 'Calling' : 'Run'}</button></div>
        <p className="api-try-hint">{isSimulated ? 'Local response from the browser simulation. No network request is sent.' : 'Sends one real GET request to the connected FastAPI address.'}</p>
        {tryResult && <div className="api-try-result"><div className="api-result-meta"><span>{tryResult.method} {tryResult.path}</span><strong className={toneFor(tryResult.status)}>{tryResult.status}</strong><small>{tryResult.latencyMs} ms</small></div><JsonCode value={tryResult.payload} /></div>}
      </div>
    </div>
    <div className="api-log-panel">
      <div className="api-log-heading"><div><span className="mono-label">RECENT REQUESTS</span><strong>Dashboard request / response log</strong></div><small>{logs.length} / 36 kept</small></div>
      {!logs.length ? <p className="api-log-empty">Waiting for the first request. Choose Live backend to poll FastAPI, or use simulated mode for local demo responses.</p> : <div className="api-request-log">{logs.slice(0, 8).map((entry) => <details className="api-log-entry" key={entry.id}><summary><time>{new Date(entry.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><code>{entry.method} {entry.path}</code><span className={`api-status ${toneFor(entry.status)}`}>{entry.status ?? 'OFFLINE'}</span><small>{entry.latencyMs} ms</small><b>{entry.mode === 'simulated' || isSimulated ? 'simulated' : 'response'}</b></summary><JsonCode value={entry.payload} /></details>)}</div>}
    </div>
    <p className="api-console-foot">Dashboard polling: GET /health, GET /state, GET /anomalies?limit=30 · Stream: WS /stream · <span>{isSimulated ? 'simulated payloads from the shared browser state' : 'response payloads received from FastAPI'}</span></p>
  </section>
}
