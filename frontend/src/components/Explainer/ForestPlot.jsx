export function ForestPlot({ fault }) {
  const anomaly = fault !== 'none'
  return <div className="forest-plot">
    <div className="forest-heading"><span className="mono-label">ISOLATION FOREST · CONCEPT SKETCH</span><span className="plot-not-to-scale">ILLUSTRATIVE · NOT TO SCALE</span></div>
    <svg viewBox="0 0 700 222" role="img" aria-label="Concept sketch showing normal points clustered together and unusual points isolated beyond a zero decision threshold">
      <rect x="33" y="25" width="410" height="154" fill="#202720" />
      <line x1="443" y1="21" x2="443" y2="182" stroke="#d7a84c" strokeWidth="1.5" strokeDasharray="4 5" />
      <line x1="33" y1="179" x2="673" y2="179" stroke="#596358" />
      <text x="42" y="17" className="plot-axis-label">MANY SPLITS TO ISOLATE</text>
      <text x="453" y="17" className="plot-axis-label">FEWER SPLITS</text>
      <text x="421" y="200" className="plot-zero">0</text>
      <text x="534" y="200" className="plot-axis-label">DECISION SCORE</text>
      <text x="447" y="36" className="plot-threshold">threshold</text>
      {[[91,105],[124,81],[143,129],[171,99],[196,142],[207,72],[238,112],[259,84],[276,137],[302,100],[320,64],[341,127],[362,92],[387,117]].map(([x,y], i)=><circle className="normal-point" key={i} cx={x} cy={y} r="4.5" />)}
      <text x="70" y="164" className="plot-group-label">NORMAL TRAFFIC</text>
      <circle className={`anomaly-point ${anomaly ? 'point-hot' : ''}`} cx="508" cy="82" r="6" />
      <circle className={`anomaly-point ${anomaly ? 'point-hot' : ''}`} cx="553" cy="129" r="6" />
      <circle className={`anomaly-point ${anomaly ? 'point-hot' : ''}`} cx="596" cy="67" r="6" />
      <text x="490" y="163" className="plot-group-label">ISOLATED</text>
    </svg>
    <div className="forest-rule"><span className="rule-mark">−</span><p>In this code, the API treats <code>decision_function &lt; 0</code> as an anomaly prediction. The sketch explains the idea; it is not a measured score chart.</p></div>
  </div>
}
