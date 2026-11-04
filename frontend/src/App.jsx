import { ArrowDown, ArrowUpRight, Radio, Wrench } from 'lucide-react'
import { PipelineWalkthrough } from './components/Explainer/PipelineWalkthrough.jsx'
import { LiveTwinDashboard } from './components/Dashboard/LiveTwinDashboard.jsx'
import { LiveSimulationProvider } from './context/LiveSimulationProvider.jsx'

function App() {
  return <LiveSimulationProvider><>
    <header className="site-header">
      <a className="wordmark" href="#top" aria-label="CAN field notes home"><span className="wordmark-mark"><Radio size={16} /></span><span>CAN / FIELD NOTES</span></a>
      <nav aria-label="Main navigation"><a href="#walkthrough">How it works</a><a href="#fleet">Fleet &amp; twin</a><a href="#fault-lab">Fault lab</a></nav>
      <a className="header-link" href="#fleet">Open the twin <ArrowDown size={14} /></a>
    </header>

    <main id="top">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-side-note"><span>FIELD LOG / 01</span><span>SIMULATED CAN NETWORK</span></div>
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-tick" /> A STUDENT-BUILT VEHICLE DIGITAL TWIN</p>
          <h1 id="hero-title">A fault in.<br /><em>A signal out.</em></h1>
          <p className="hero-deck">I built a small vehicle network to see how ECU messages travel, how an Isolation Forest scores them, and what an alert actually means.</p>
          <a className="hero-cta" href="#walkthrough"><span>Follow one message</span><ArrowDown size={16} /></a>
        </div>
        <div className="hero-instrument" aria-label="Illustration of a vehicle telemetry trace">
          <div className="instrument-top"><span>BUS MONITOR</span><span className="instrument-on"><i /> ILLUSTRATION · NOT LIVE</span></div>
          <svg viewBox="0 0 630 156" role="img" aria-label="Decorative oscilloscope trace">
            <path className="scope-grid" d="M0 31H630M0 62H630M0 93H630M0 124H630M63 0V156M126 0V156M189 0V156M252 0V156M315 0V156M378 0V156M441 0V156M504 0V156M567 0V156" />
            <path className="scope-line" d="M0 95H69L83 90 96 99 109 95H166L179 92 189 96H236L247 96 257 40 268 130 279 91 291 95H346L360 91 374 96H421L434 93 449 96H491L505 94 519 96H573L586 88 598 101 611 95H630" />
            <circle className="scope-cursor" cx="257" cy="40" r="4" />
          </svg>
          <div className="instrument-bottom"><span>vcan0 / VIRTUAL</span><span>NO PHYSICAL BITRATE</span><span>TRACE IS DECORATIVE</span></div>
        </div>
        <div className="hero-index"><span>SCROLL TO TRACE THE FRAME</span><span className="index-line" /><span>01 — 06</span></div>
      </section>

      <section className="intro-note" id="about">
        <div className="intro-index"><span className="eyebrow">WHY I MADE THIS</span><span className="intro-number">01</span></div>
        <div className="intro-body"><h2>Not a real car.<br /><span>A real message format.</span></h2><p>This project simulates three ECUs, sends CAN-shaped frames, logs them, and uses a small anomaly detector to flag unusual combined readings. I made this page to make the moving parts easier to follow—and to be honest about what the code does and doesn’t measure.</p><div className="note-stamp"><Wrench size={15} /><span>WORKSHOP NOTE / READ THE CODE, NOT THE CLAIMS</span></div></div>
        <div className="intro-side"><span className="mono-label">NETWORK</span><strong>3 ECUs</strong><span className="mono-label">FRAME LENGTH</span><strong>8 bytes</strong><span className="mono-label">DETECTOR</span><strong>Isolation Forest</strong></div>
      </section>

      <PipelineWalkthrough />

      <section className="code-truth" aria-labelledby="truth-title">
        <div className="truth-marker"><span className="eyebrow">READ THIS BEFORE THE DEMO</span><span className="marker-line" /></div>
        <div><h2 id="truth-title">One small correction<br />to the README diagram.</h2><p>The logger and the API are separate listeners on the CAN bus. The API does its own decoding and anomaly scoring; it does not wait for the logger or read its CSV file. This walkthrough follows that actual wiring.</p></div>
        <a href="#fault-lab">Try an injected fault <ArrowUpRight size={15} /></a>
      </section>

      <LiveTwinDashboard />
    </main>

    <footer className="site-footer"><a className="wordmark" href="#top"><span className="wordmark-mark"><Radio size={16} /></span><span>CAN / FIELD NOTES</span></a><p className="footer-credit">My addition: an interactive explainer, a fleet map, and a dual-mode twin dashboard.</p></footer>
  </></LiveSimulationProvider>
}

export default App
