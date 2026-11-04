import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// OSM-mapped Front Gate node; route extents recenter the map once GeoJSON loads.
const CENTER = [17.78106, 83.38038]
const ROUTE_COLORS = ['#d7a84c', '#a6bd91', '#c7a891', '#91a6a0']
const FALLBACK_IDS = ['project', 'fleet-02', 'fleet-03', 'fleet-04']
const radians = (degrees) => degrees * Math.PI / 180
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function distanceMeters(a, b) {
  const radius = 6371000
  const dLat = radians(b[0] - a[0])
  const dLng = radians(b[1] - a[1])
  const lat1 = radians(a[0])
  const lat2 = radians(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function bearing(a, b) {
  const dLng = radians(b[1] - a[1])
  const y = Math.sin(dLng) * Math.cos(radians(b[0]))
  const x = Math.cos(radians(a[0])) * Math.sin(radians(b[0])) - Math.sin(radians(a[0])) * Math.cos(radians(b[0])) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function routeMetrics(points) {
  let total = 0
  const segments = points.slice(0, -1).map((point, index) => {
    const length = distanceMeters(point, points[index + 1])
    const start = total
    total += length
    return { length, start, end: total, angle: bearing(point, points[index + 1]) }
  })
  const corners = segments.map((segment, index) => {
    if (index === segments.length - 1) return { distance: total, sharpness: 0 }
    const difference = Math.abs(((segments[index + 1].angle - segment.angle + 540) % 360) - 180)
    return { distance: segment.end, sharpness: clamp((difference - 22) / 120, 0, .72) }
  })
  return { total, segments, corners }
}

function pointAt(points, metrics, distance) {
  if (!points.length) return null
  let remaining = ((distance % metrics.total) + metrics.total) % metrics.total
  let index = metrics.segments.findIndex((segment) => remaining <= segment.end)
  if (index < 0) index = metrics.segments.length - 1
  const segment = metrics.segments[index]
  const fraction = segment.length ? (remaining - segment.start) / segment.length : 0
  const start = points[index]
  const end = points[index + 1]
  return {
    position: [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction],
    angle: segment.angle,
    segmentIndex: index,
  }
}

function cornerSpeedFactor(metrics, distance) {
  let factor = 1
  for (const corner of metrics.corners) {
    if (corner.sharpness < .08) continue
    let ahead = (corner.distance - distance + metrics.total) % metrics.total
    if (ahead > metrics.total / 2) ahead -= metrics.total
    const proximity = clamp(1 - Math.abs(ahead) / 35, 0, 1)
    factor = Math.min(factor, 1 - corner.sharpness * proximity)
  }
  return factor
}

function normalizeRouteData(data) {
  if (!Array.isArray(data?.features)) return []
  return data.features.flatMap((feature, index) => {
    const coords = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : []
    const points = coords.map(([lon, lat]) => [lat, lon]).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
    if (points.length < 3) return []
    if (distanceMeters(points[0], points[points.length - 1]) > 5) points.push(points[0])
    const metrics = routeMetrics(points)
    if (metrics.total < 80) return []
    return [{ id: feature.properties?.carId || FALLBACK_IDS[index], name: feature.properties?.name || 'OSRM road loop', points, metrics, color: ROUTE_COLORS[index % ROUTE_COLORS.length] }]
  })
}

function carIcon(car, angle, selected) {
  const color = car.fault ? '#df6755' : car.project ? '#d7a84c' : ROUTE_COLORS[car.routeIndex % ROUTE_COLORS.length]
  const ring = car.fault ? 'fault' : selected ? 'selected' : ''
  const svg = `<svg viewBox="0 0 40 40" aria-hidden="true"><g transform="rotate(${angle} 20 20)"><path d="M20 3 27 12 29 28 25 36 15 36 11 28 13 12Z" fill="${color}" stroke="#101410" stroke-width="2"/><path d="M16 13h8v10h-8zM15 27h10" fill="#d9ded3" stroke="#101410" stroke-width="1.2"/><path d="M14 9h3M23 9h3" stroke="#f3dfae" stroke-width="2" stroke-linecap="round"/></g></svg>`
  return L.divIcon({ className: `fleet-car-icon ${ring}`, html: `<span class="fleet-car-shell ${ring}" style="--car-color:${color}">${svg}<i>${car.callsign}</i></span>`, iconSize: [50, 48], iconAnchor: [25, 20] })
}

function MapController({ follow, selectedPosition, selectedId, routes }) {
  const map = useMap()
  useEffect(() => { if (follow && selectedPosition) map.panTo(selectedPosition, { animate: false }) }, [follow, selectedPosition, selectedId, map])
  useEffect(() => {
    if (!routes.length || follow) return
    const points = routes.flatMap((route) => route.points)
    map.fitBounds(points, { padding: [34, 34], maxZoom: 17, animate: false })
  }, [routes, follow, map])
  return null
}

function MapTools() {
  const map = useMap()
  return <div className="leaflet-top leaflet-left field-map-zoom" role="group" aria-label="Map zoom controls">
    <div className="leaflet-control"><button type="button" aria-label="Zoom in" onClick={() => map.zoomIn()}>+</button><button type="button" aria-label="Zoom out" onClick={() => map.zoomOut()}>−</button></div>
  </div>
}

const initialPositions = (cars, routes) => routes.flatMap((route) => {
  const car = cars.find((item) => item.id === route.id)
  if (!car) return []
  const routeIndex = Math.max(0, cars.findIndex((item) => item.id === route.id))
  const distance = Math.min(route.metrics.total * .08, routeIndex * 24)
  return [{ id: route.id, routeId: route.id, routeIndex, distance, ...pointAt(route.points, route.metrics, distance), bearing: pointAt(route.points, route.metrics, distance)?.angle || 0, trail: [] }]
})

export function FleetMap({ cars, selectedId, onSelect, running, started, speedMultiplier, follow, simulationTime }) {
  const carsRef = useRef(cars)
  const [routes, setRoutes] = useState([])
  const [routeError, setRouteError] = useState('')
  const [debugRoutes, setDebugRoutes] = useState(false)
  const [positions, setPositions] = useState([])
  const lastCommit = useRef(0)
  const previousSimulationTime = useRef(simulationTime)
  const selectedPosition = positions.find((item) => item.id === selectedId)?.position

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/gitam-routes.geojson`)
      .then((response) => {
        if (!response.ok) throw new Error('Route file is missing.')
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        const loaded = normalizeRouteData(data)
        setRoutes(loaded)
        setPositions(initialPositions(carsRef.current, loaded))
        if (!loaded.length) setRouteError('No OSRM routes are saved yet. Run scripts/generate_gitam_routes.py from the project root, then reload this page.')
        else setRouteError('')
      })
      .catch(() => {
        if (!cancelled) setRouteError('Road routes are not available yet. Run scripts/generate_gitam_routes.py from the project root, then reload this page.')
      })
    return () => { cancelled = true }
  }, [])

  carsRef.current = cars
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes])

  useEffect(() => {
    if (simulationTime < previousSimulationTime.current) {
      setPositions(initialPositions(cars, routes))
      lastCommit.current = 0
    }
    previousSimulationTime.current = simulationTime
  }, [simulationTime, cars, routes])

  useEffect(() => {
    let rafId
    let previous = 0
    let trailElapsed = 0
    let bearingState = new Map()
    const frame = (now) => {
      if (!previous) previous = now
      const dt = Math.min(.08, Math.max(0, (now - previous) / 1000))
      previous = now
      if (!document.hidden && started && running && now - lastCommit.current >= 55 && routes.length) {
        const currentCars = carsRef.current
        setPositions((current) => {
          const occupied = []
          return current.map((position) => {
            const car = currentCars.find((item) => item.id === position.id)
            const route = routeById.get(position.routeId)
            if (!route || !car) return position
            const speedKmh = Math.max(0, Number(car.state?.speed?.speed) || 0)
            const factor = cornerSpeedFactor(route.metrics, position.distance)
            let nextDistance = (position.distance + speedKmh / 3.6 * factor * dt * speedMultiplier) % route.metrics.total
            let next = pointAt(route.points, route.metrics, nextDistance)
            const isCrowded = (candidate) => occupied.some((other) => distanceMeters(candidate.position, other.position) < 22)
            if (isCrowded(next)) {
              const held = pointAt(route.points, route.metrics, position.distance)
              if (!isCrowded(held)) { nextDistance = position.distance; next = held }
              else { nextDistance = position.distance; next = held }
            }
            occupied.push(next)
            const targetBearing = next.angle
            const previousBearing = bearingState.get(position.id) ?? targetBearing
            const delta = ((targetBearing - previousBearing + 540) % 360) - 180
            const smoothBearing = (previousBearing + delta * clamp(dt * 5, 0, 1) + 360) % 360
            bearingState.set(position.id, smoothBearing)
            const trail = trailElapsed >= .28 ? [...position.trail, { point: next.position }].slice(-14) : position.trail
            return { ...position, ...next, bearing: smoothBearing, distance: nextDistance, trail }
          })
        })
        if (trailElapsed >= .28) trailElapsed = 0
        trailElapsed += dt
        lastCommit.current = now
      }
      rafId = window.requestAnimationFrame(frame)
    }
    rafId = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(rafId)
  }, [running, started, speedMultiplier, routes, routeById])

  return <div className="real-map-frame">
    <MapContainer center={CENTER} zoom={16} minZoom={14} maxZoom={19} zoomControl={false} scrollWheelZoom className="real-fleet-map" aria-label="OpenStreetMap around GITAM Visakhapatnam with simulated vehicle routes">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} maxNativeZoom={18} />
      <MapTools />
      <MapController follow={follow} selectedPosition={selectedPosition} selectedId={selectedId} routes={routes} />
      {debugRoutes && routes.map((route) => <Polyline key={route.id} positions={route.points} pathOptions={{ color: route.color, weight: 3, opacity: .9, dashArray: '6 6' }} />)}
      {positions.map((position) => {
        const car = cars.find((item) => item.id === position.id)
        if (!car) return null
        const trailPoints = position.trail.map((entry) => entry.point)
        const color = car.fault ? '#df6755' : ROUTE_COLORS[position.routeIndex % ROUTE_COLORS.length]
        return <Fragment key={car.id}>
          {started && trailPoints.slice(1).map((point, index) => <Polyline key={`${car.id}-trail-${index}`} positions={[trailPoints[index], point]} pathOptions={{ color, weight: 4, opacity: .08 + ((index + 1) / trailPoints.length) * .42, lineCap: 'round' }} />)}
          <Marker position={position.position} icon={carIcon({ ...car, routeIndex: position.routeIndex }, position.bearing, selectedId === car.id)} eventHandlers={{ click: () => onSelect(car.id) }} keyboard title={`${car.callsign}${started ? `, ${Number(car.state?.speed?.speed || 0).toFixed(1)} kilometres per hour` : ', parked'}${car.fault ? ', fault active' : ''}`} />
        </Fragment>
      })}
    </MapContainer>
    {routeError && <div className="map-route-notice" role="status"><strong>REAL ROAD GEOMETRY NOT INSTALLED</strong><span>{routeError}</span></div>}
    <details className="map-debug-tools"><summary>Route debug</summary><label><input type="checkbox" checked={debugRoutes} onChange={(event) => setDebugRoutes(event.target.checked)} /> Draw saved OSRM lines</label></details>
    {started && !running && <div className="map-paused-stamp">SIMULATION PAUSED</div>}
  </div>
}

export const GITAM_MAP_CENTER = CENTER

