export default function CanvasEditing() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">THE EDITOR</span></div>
    <div className="deck-content">
      <h1 className="deck-heading">A canvas built for process editing</h1>
      <div className="mt-[5vh] grid grid-cols-[0.85fr_1.3fr] gap-[5vw] items-center">
        <div className="deck-panel h-[49vh] relative">
          <svg viewBox="0 0 600 550" className="w-full h-full" aria-label="Orthogonal connectors and a return loop">
            <defs><marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#99f6e4"/></marker></defs>
            <path d="M150 225 H260 M340 225 H440 M300 265 V415 H440 M490 175 V80 H100 V175" stroke="#99f6e4" strokeWidth="4" fill="none" markerEnd="url(#canvas-arrow)"/>
            <rect x="50" y="175" width="100" height="100" rx="14" fill="#14b8a6"/>
            <path d="M300 185 L340 225 L300 265 L260 225 Z" fill="#14b8a6"/>
            <rect x="440" y="175" width="100" height="100" rx="14" fill="#14b8a6"/>
            <rect x="440" y="365" width="100" height="100" rx="14" fill="#14b8a6"/>
          </svg>
        </div>
        <ul className="deck-list deck-copy">
          <li>Edit diagrams with bpmn-js</li>
          <li>Use start events, end events, tasks, and gateways</li>
          <li>Connect forward steps horizontally</li>
          <li>Route lower gateway branches with 90° bends</li>
          <li>Draw return loops above the diagram on separate lanes</li>
        </ul>
      </div>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>05</span></div>
  </div>;
}
