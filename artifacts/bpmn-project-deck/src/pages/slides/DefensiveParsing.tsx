export default function DefensiveParsing() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">THE SAFEGUARDS</span></div>
    <div className="deck-content">
      <h1 className="deck-heading">Defensive parsing, not silent failure</h1>
      <div className="mt-[6vh] grid grid-cols-2 gap-[6vw] deck-copy">
        <ul className="deck-list">
          <li>Use a concrete JSON example and JSON-object response mode</li>
          <li>Remove markdown fences before parsing model output</li>
          <li>Fill missing node names from their identifiers</li>
        </ul>
        <ul className="deck-list">
          <li>Reject malformed node types and dangling references</li>
          <li>Retry transient provider failures within a bounded budget</li>
          <li>Preserve the description when generation fails</li>
        </ul>
      </div>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>08</span></div>
  </div>;
}
