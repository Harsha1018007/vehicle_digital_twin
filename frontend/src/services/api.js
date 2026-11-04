const timeoutSignal = (duration = 4000) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(duration)
  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), duration)
  return controller.signal
}

export async function requestTwinEndpoint(baseUrl, path, onRequest = () => {}) {
  const started = performance.now()
  let response
  let payload = null
  let error = ''
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, { signal: timeoutSignal() })
    try { payload = await response.json() } catch { payload = { error: 'Response was not valid JSON.' } }
    if (!response.ok) error = `API ${path} returned ${response.status}`
  } catch (caught) {
    const timedOut = caught.name === 'AbortError' || caught.name === 'TimeoutError'
    const message = timedOut
      ? `The API request to ${path} timed out. Check that FastAPI is running and reachable.`
        : caught instanceof TypeError
        ? `Could not reach ${baseUrl}. Check the address, CORS settings, and that FastAPI is running.`
        : caught.message || 'The API request failed.'
    error = message
    payload = { error: message }
  }
  const result = { method: 'GET', path, status: response?.status ?? null, latencyMs: Math.round(performance.now() - started), payload, error }
  onRequest(result)
  return result
}

export async function readTwinApi(baseUrl, onRequest) {
  const [healthCall, stateCall, anomalyCall] = await Promise.all([
    requestTwinEndpoint(baseUrl, '/health', onRequest),
    requestTwinEndpoint(baseUrl, '/state', onRequest),
    requestTwinEndpoint(baseUrl, '/anomalies?limit=30', onRequest),
  ])
  const health = healthCall.payload
  const state = stateCall.payload
  const anomalyData = anomalyCall.payload
  const failed = [healthCall, stateCall, anomalyCall].find((call) => !call.status || call.status < 200 || call.status >= 300)
  if (failed) throw new Error(failed.error || `API ${failed.path} returned ${failed.status}`)
  if (!health || !state?.engine || !state?.brake || !state?.speed || !Array.isArray(anomalyData?.events)) {
    throw new Error('FastAPI responded, but its payload does not match the vehicle digital twin API.')
  }
  return { health, state, events: anomalyData.events || [], total: anomalyData.total || 0 }
}
