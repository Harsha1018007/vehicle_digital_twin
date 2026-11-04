import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react'
import { FAULTS, faultReading } from '../../data/faults.js'
import { useLiveSimulation } from '../../context/LiveSimulationProvider.jsx'
import { BROWSER_FAULTS } from '../../data/liveVehicleSimulation.js'
import { CanFrame } from './CanFrame.jsx'
import { ForestPlot } from './ForestPlot.jsx'

const STEPS = [
  { eyebrow: '01 / ECU SIGNALS', title: 'Three ECUs publish readings.', copy: 'Engine, brake, and speed update RPM, pedal/pressure, and vehicle/wheel speed. In browser simulation, each ECU produces synthetic readings and faults enter through the controls below.' },
  { eyebrow: '02 / CAN 2.0B FRAME', title: 'A value becomes bytes.', copy: 'Each simulator packs its signals into an eight-byte payload. The arbitration ID tells listeners which ECU sent it; the DLC says how many data bytes follow.' },
  { eyebrow: '03 / VCAN0 BUS', title: 'One shared wire, in software.', copy: 'In live backend mode, messages go onto Linux vcan0; the lower CAN identifier wins arbitration. Browser simulation uses this same illustrated route locally and never sends frames to a real CAN interface.' },
  { eyebrow: '04 / CSV CAPTURE', title: 'The logger keeps a record.', copy: 'On the backend, a separate listener decodes each recognized frame and writes a sparse CSV row. The browser animation shows a frame passing this stage but does not write a file.' },
  { eyebrow: '05 / ISOLATION FOREST API', title: 'The detector scores combined state.', copy: 'Live backend mode sends the latest ECU values through the trained Isolation Forest. Browser mode uses the training ranges and API diagnosis cutoffs as a labeled rule-based score proxy, not as a model prediction.' },
  { eyebrow: '06 / REACT + STREAMLIT', title: 'A detector result reaches a dashboard.', copy: 'The API stores real backend anomaly events for its dashboards. In browser simulation, the React twin reads the same local synthetic state and simulated detector events that generated the CAN-style frames.' },
]

export function PipelineWalkthrough() {
  const [step, setStep] = useState(0)
  const [fault, setFault] = useState('none')
  const [playing, setPlaying] = useState(false)
  const simulation = useLiveSimulation()
  const reducedMotion = usePrefersReducedMotion()
  const diagramFault = simulation.source === 'browser' ? simulation.fault || 'none' : fault
  const activeFault = useMemo(() => FAULTS.find((item) => item.id === fault), [fault])
  const activeBrowserFault = BROWSER_FAULTS.some((item) => item.id === fault)

  useEffect(() => {
    if (!playing) return undefined
    const timer = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 3600)
    return () => window.clearInterval(timer)
  }, [playing])

  const reset = () => {
    setPlaying(false)
    setStep(0)
    setFault('none')
    if (BROWSER_FAULTS.some((item) => item.id === simulation.fault)) simulation.clearFault()
  }
  const selectFault = (faultId) => {
    setFault(faultId)
    if (faultId === 'none') simulation.clearFault()
    else if (BROWSER_FAULTS.some((item) => item.id === faultId)) {
      simulation.selectSource('browser')
      simulation.injectFault(faultId)
    }
  }
  const sendThroughPipeline = () => {
    setStep(0)
    setPlaying(true)
  }

  return (
    <section className="section explainer" id="walkthrough" aria-labelledby="walkthrough-title">
      <div className="section-heading">
        <div><p className="eyebrow">FIELD NOTE 01 <span>—</span> THE SIGNAL PATH</p><h2 id="walkthrough-title">From sensor value<br />to dashboard alert.</h2></div>
        <p className="section-intro">The live backend path follows the code; browser simulation sends synthetic frames through the same illustrated stages locally. Move step by step or watch the packets travel.</p>
      </div>

      <div className="walkthrough-layout">
        <div className="step-rail" aria-label="Walkthrough steps">
          {STEPS.map((item, index) => (
            <button className={`step-chip ${step === index ? 'is-active' : ''} ${step > index ? 'is-done' : ''}`} key={item.eyebrow} onClick={() => { setPlaying(false); setStep(index) }} aria-current={step === index ? 'step' : undefined}>
              <span className="step-dot">{step > index ? '✓' : String(index + 1).padStart(2, '0')}</span><span>{item.eyebrow.split(' / ')[1]}</span>
            </button>
          ))}
        </div>

        <div className="walkthrough-card">
          <div className="walkthrough-copy" aria-live="polite">
            <p className="eyebrow amber">{STEPS[step].eyebrow}</p>
            <h3>{STEPS[step].title}</h3>
            <p>{STEPS[step].copy}</p>
            <div className="step-controls">
              <button className="icon-button" onClick={() => { setPlaying(false); setStep((step + STEPS.length - 1) % STEPS.length) }} aria-label="Previous step"><ArrowLeft size={17} /></button>
              <span className="step-count">{String(step + 1).padStart(2, '0')} <i>/</i> {String(STEPS.length).padStart(2, '0')}</span>
              <button className="icon-button" onClick={() => setStep((step + 1) % STEPS.length)} aria-label="Next step"><ArrowRight size={17} /></button>
              <span className="control-spacer" />
              <button className="play-button" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Auto-play'}</button>
              <button className="icon-button" onClick={reset} aria-label="Reset walkthrough"><RotateCcw size={16} /></button>
            </div>
          </div>

          <div className="signal-board" aria-label={`Diagram showing ${STEPS[step].eyebrow}`}>
            <SignalPath step={step} fault={diagramFault} source={simulation.source} packets={simulation.source === 'browser' ? simulation.pipelinePackets : []} running={simulation.source === 'browser' && simulation.running} motionEnabled={!reducedMotion} speedMultiplier={simulation.speedMultiplier} simulationTime={simulation.simulationTime} />
            {step === 1 && <CanFrame />}
            {step === 4 && <ForestPlot fault={fault} />}
            {(step === 0 || step === 2 || step === 3 || step === 5) && <PipelineNodes step={step} fault={diagramFault} source={simulation.source} />}
          </div>
        </div>
      </div>

      <div className="fault-console" id="fault-lab">
        <div className="console-title"><span className="live-dot" /><div><p className="eyebrow">TRY IT YOURSELF</p><h3>Inject a fault into the walkthrough.</h3></div></div>
        <label className="fault-select-label" htmlFor="fault-select">Fault scenario</label>
        <select id="fault-select" value={fault} onChange={(event) => selectFault(event.target.value)}>
          {FAULTS.map((item) => <option value={item.id} key={item.id}>{item.label}{item.id !== 'none' && !BROWSER_FAULTS.some((browserFault) => browserFault.id === item.id) ? ' · walkthrough example' : ''}</option>)}
        </select>
        <div className="fault-reading"><span className="mono-label">{activeFault.ecu}</span><strong>{faultReading(fault)}</strong><span className={`fault-status ${fault === 'none' ? 'status-ok' : activeBrowserFault ? 'status-alert' : 'status-note'}`}>{fault === 'none' ? 'NORMAL SAMPLE' : activeBrowserFault ? 'LIVE BROWSER FAULT' : 'WALKTHROUGH EXAMPLE'}</span></div>
        <div className={`alert-result ${fault === 'none' ? '' : activeBrowserFault ? 'is-alert' : 'is-note'}`} aria-live="polite">
          <span className="result-mark">{fault === 'none' ? '—' : activeBrowserFault ? '!' : 'i'}</span>
          <div><span className="mono-label">{fault === 'none' ? 'SIMULATED SAMPLE' : activeBrowserFault ? 'SIMULATED DETECTOR RULE' : 'REFERENCE ONLY'}</span><p>{fault === 'none' ? 'No fault is injected in the browser simulation.' : activeBrowserFault ? `${activeFault.alert} The alert is recorded after the generated frame reaches the detector.` : activeFault.alert}</p></div>
        </div>
        <button className="text-link" onClick={sendThroughPipeline}>Send this scenario through the pipeline <ArrowRight size={16} /></button>
      </div>
    </section>
  )
}

function SignalPath({ step, fault, source, packets, running, motionEnabled, speedMultiplier, simulationTime }) {
  const svgRef = useRef(null)
  const route = 'M52 185H286H395C440 185 440 82 493 82H600C555 82 555 185 510 185C440 185 440 294 493 294H630C675 294 675 185 708 185'
  const hasFault = fault !== 'none' || packets.some((packet) => packet.anomalous)

  useEffect(() => {
    if (!svgRef.current) return
    if (running && motionEnabled) svgRef.current.unpauseAnimations?.()
    else svgRef.current.pauseAnimations?.()
  }, [running, motionEnabled, svgRef])

  return <svg ref={(node) => { svgRef.current = node }} className="signal-path" viewBox="0 0 760 390" role="img" aria-label={`Pipeline diagram with ${packets.length} browser simulation frames in transit at simulation time ${(simulationTime / 1000).toFixed(1)} seconds`}>
    <path d="M52 185H395C440 185 440 82 493 82H708M395 185C440 185 440 294 493 294H708" fill="none" stroke="#465148" strokeWidth="2" strokeDasharray="4 7" />
    <path className={`signal-flow ${running && motionEnabled ? '' : 'signal-paused'}`} d={step < 3 ? 'M52 185H395C440 185 440 82 493 82H708' : step === 3 ? 'M52 185H395C440 185 440 294 493 294H708' : 'M52 185H708'} fill="none" stroke={hasFault ? '#df6755' : '#d7a84c'} strokeWidth="3" strokeDasharray="5 9" />
    <g aria-hidden="true">{packets.map((packet) => <g key={packet.id} className={`live-pipeline-packet ${packet.anomalous ? 'packet-anomaly' : ''}`}>
      <circle r="5" fill={packet.anomalous ? '#df6755' : '#d7a84c'} />
      <text x="8" y="-8">{packet.canId}</text>
      <animateMotion dur={`${8 / speedMultiplier}s`} repeatCount="1" fill="freeze" path={route} />
    </g>)}</g>
    <text x="43" y="356" className="pipeline-live-status">{source === 'backend' ? 'LIVE BACKEND · RAW CAN FRAMES ARE NOT EXPOSED' : !running ? 'PAUSED · FRAME FLOW HELD' : !motionEnabled ? 'REDUCED MOTION · BROWSER DATA STILL UPDATES' : `BROWSER SIMULATION · ${packets.length} PACKETS IN TRANSIT`}</text>
    <text x="43" y="45" className="svg-kicker">VIRTUAL VEHICLE NETWORK</text>
  </svg>
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return undefined
    const update = (event) => setReduced(event.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return reduced
}

function PipelineNodes({ step, fault, source }) {
  const node = (x, y, title, sub, key, active) => <g key={key} className={`diagram-node ${active ? 'node-active' : ''}`} transform={`translate(${x} ${y})`}><rect width="126" height="76" rx="3" /><text x="13" y="28" className="node-title">{title}</text><text x="13" y="51" className="node-sub">{sub}</text></g>
  const browserMode = source === 'browser'
  return <svg className="board-layer" viewBox="0 0 760 390" aria-hidden="true">
    {node(23,147,'ECU SIGNALS','3 message sources','ecus',step===0)}
    {node(223,147,'vcan0 BUS','shared virtual bus','bus',step===2)}
    {node(470,45,'CSV CAPTURE',browserMode ? 'visual pass-through' : 'separate listener','logger',step===3)}
    {node(470,258,browserMode ? 'SIM DETECTOR' : 'FASTAPI + IF',browserMode ? 'rules · score proxy' : 'model decision','api',step===4)}
    {node(630,147,browserMode ? 'REACT TWIN' : 'DASHBOARDS',browserMode ? 'shared browser state' : 'React + Streamlit','dash',step===5)}
    <text x="472" y="145" className="branch-note">parallel observer</text>
    {fault !== 'none' && <g className="fault-tag" transform="translate(286 238)"><rect width="145" height="27" rx="2" /><text x="10" y="18">SIMULATED FAULT</text></g>}
    {step===0 && <g transform="translate(31 242)"><text className="board-micro">ENGINE · BRAKE · SPEED</text></g>}
    {step===5 && <g className="alert-tag" transform="translate(640 241)"><circle cx="7" cy="7" r="5" /><text x="18" y="11">ALERT EVENT</text></g>}
  </svg>
}
