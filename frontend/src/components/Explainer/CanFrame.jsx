import { SAMPLE_BYTES, ENGINE_FRAME, decodeEngineFrame } from '../../data/canProtocol.js'

const decoded = decodeEngineFrame(SAMPLE_BYTES)

export function CanFrame() {
  return <div className="frame-diagram">
    <div className="frame-meta">
      <div><span className="mono-label">ARBITRATION ID</span><strong>{ENGINE_FRAME.arbitrationId}</strong><small>Engine ECU · 11-bit standard ID</small></div>
      <div><span className="mono-label">DLC</span><strong>{String(ENGINE_FRAME.dlc).padStart(2, '0')}</strong><small>data bytes</small></div>
    </div>
    <div className="byte-row" aria-label="Eight data bytes">
      {SAMPLE_BYTES.map((byte, index) => <div className={`byte-cell ${index < 2 ? 'byte-rpm' : ''}`} key={index}><span className="byte-index">{String(index).padStart(2, '0')}</span><strong>{byte.toString(16).toUpperCase().padStart(2, '0')}</strong></div>)}
    </div>
    <div className="byte-key"><span><i className="key-swatch key-amber" /> RPM, big-endian</span><span><i className="key-swatch" /> other signals</span></div>
    <div className="decode-line"><span className="mono-label">ENCODE</span><span>2400 rpm → <b>0x09</b> <b>0x60</b></span><span className="decode-arrow">↔</span><span className="mono-label">DECODE</span><span><b>0x0960</b> → {decoded.rpm} rpm</span></div>
    <div className="frame-foot"><span>Payload layout from <code>engine_ecu.py</code></span><span>Big-endian · reserved bytes are zero</span></div>
  </div>
}
