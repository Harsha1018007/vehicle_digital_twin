import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { advanceMachine, BROWSER_FAULTS, createInitialMachine } from '../data/liveVehicleSimulation.js'
import { SIM_CARS } from '../data/simulatedNetwork.js'

const LiveSimulationContext = createContext(null)
const TICK_MS = 125

export function LiveSimulationProvider({ children }) {
  const machineRef = useRef(null)
  if (!machineRef.current) machineRef.current = createInitialMachine()
  const speedRef = useRef(1)
  const runningRef = useRef(false)
  const [machine, setMachine] = useState(machineRef.current)
  const [running, setRunning] = useState(false)
  const [speedMultiplier, setSpeedState] = useState(1)
  const [source, setSource] = useState('browser')

  useEffect(() => {
    if (!running) return undefined
    let animationId
    let previousTime = 0
    let accumulator = 0

    const tick = (now) => {
      if (document.hidden) {
        previousTime = now
        animationId = window.requestAnimationFrame(tick)
        return
      }
      if (!previousTime) previousTime = now
      const elapsed = Math.min(100, now - previousTime)
      previousTime = now
      accumulator += elapsed * speedRef.current
      let advanced = false

      while (accumulator >= TICK_MS) {
        machineRef.current = advanceMachine(machineRef.current, TICK_MS)
        accumulator -= TICK_MS
        advanced = true
      }

      if (advanced) setMachine(machineRef.current)
      animationId = window.requestAnimationFrame(tick)
    }

    animationId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationId)
  }, [running])

  const start = () => {
    const current = machineRef.current
    const projectFault = current.carFaults?.project || current.fault
    if (!current.started) {
      machineRef.current = {
        ...current,
        started: true,
        fault: projectFault || null,
        autoFaultPending: !projectFault,
        autoFaultAt: current.simulationTime + 10_000,
        carFaults: { ...current.carFaults, project: projectFault || null },
        stuckFrames: 0,
        stuckSpeed: null,
        lastAlertKey: null,
      }
      setMachine(machineRef.current)
    }
    runningRef.current = true
    setRunning(true)
  }

  const pause = () => {
    runningRef.current = false
    setRunning(false)
  }

  const reset = () => {
    const next = createInitialMachine()
    machineRef.current = next
    setMachine(next)
    setSpeedMultiplier(1)
    pause()
  }

  const setSpeedMultiplier = (value) => {
    const next = Math.max(0.5, Math.min(4, Number(value) || 1))
    speedRef.current = next
    setSpeedState(next)
  }

  const injectFault = (faultId, carId = 'project') => {
    if (!BROWSER_FAULTS.some((fault) => fault.id === faultId)) return
    const current = machineRef.current
    if (carId === 'project') machineRef.current = {
        ...current,
        fault: faultId,
        autoFaultPending: false,
        autoFaultAt: null,
        carFaults: { ...current.carFaults, project: faultId },
        stuckFrames: 0,
        stuckSpeed: faultId === 'sensor_stuck' ? current.vehicle.speed.speed : null,
        lastAlertKey: null,
      }
    else machineRef.current = {
      ...current,
      carFaults: { ...current.carFaults, [carId]: faultId },
      carStuckFrames: { ...current.carStuckFrames, [carId]: 0 },
      carStuckSpeeds: { ...current.carStuckSpeeds, [carId]: faultId === 'sensor_stuck' ? current.fleetStates[carId]?.speed.speed : null },
      carDecisions: { ...current.carDecisions, [carId]: { ...current.carDecisions[carId], diagnosis: '' } },
    }
    setMachine(machineRef.current)
    if (!runningRef.current) start()
  }

  const clearFault = (carId = 'project') => {
    const current = machineRef.current
    if (carId === 'project') machineRef.current = { ...current, fault: null, carFaults: { ...current.carFaults, project: null }, stuckFrames: 0, stuckSpeed: null, lastAlertKey: null, alerts: current.alerts.filter((alert) => alert.carId !== carId) }
    else machineRef.current = {
      ...current,
      carFaults: { ...current.carFaults, [carId]: null },
      carStuckFrames: { ...current.carStuckFrames, [carId]: 0 },
      carStuckSpeeds: { ...current.carStuckSpeeds, [carId]: null },
      carDecisions: { ...current.carDecisions, [carId]: { ...current.carDecisions[carId], diagnosis: '' } },
      alerts: current.alerts.filter((alert) => alert.carId !== carId),
    }
    setMachine(machineRef.current)
  }

  const setNaturalAnomalies = (enabled) => {
    machineRef.current = { ...machineRef.current, naturalAnomalies: Boolean(enabled) }
    setMachine(machineRef.current)
  }

  const selectSource = (nextSource) => {
    setSource(nextSource)
    if (nextSource === 'backend') pause()
  }

  const value = useMemo(() => ({
    ...machine,
    cars: SIM_CARS.map((car) => ({
      ...car,
      state: machine.started ? (car.id === 'project' ? machine.vehicle : machine.fleetStates[car.id]) : null,
      fault: machine.carFaults?.[car.id] || null,
      decision: machine.carDecisions?.[car.id] || machine.latestDecision,
    })),
    source,
    running,
    speedMultiplier,
    start,
    pause,
    reset,
    setSpeedMultiplier,
    injectFault,
    clearFault,
    setNaturalAnomalies,
    selectSource,
  }), [machine, source, running, speedMultiplier])

  return <LiveSimulationContext.Provider value={value}>{children}</LiveSimulationContext.Provider>
}

export function useLiveSimulation() {
  const context = useContext(LiveSimulationContext)
  if (!context) throw new Error('useLiveSimulation must be used inside LiveSimulationProvider')
  return context
}
