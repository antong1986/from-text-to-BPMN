export default function DeliveryArtifacts() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">THE OUTPUTS</span></div>
    <div className="deck-content">
      <h1 className="deck-heading">From a diagram to delivery artifacts</h1>
      <div className="mt-[6vh] grid grid-cols-2 gap-x-[5vw] gap-y-[5vh] deck-copy">
        <div className="border-t-[0.4vh] border-primary pt-[3vh]"><p>BPMN XML: an editable process model</p></div>
        <div className="border-t-[0.4vh] border-primary pt-[3vh]"><p>SVG: a visual diagram for sharing</p></div>
        <div className="deck-rule pt-[3vh]"><p>SQL: a starter schema derived from the current diagram</p></div>
        <div className="deck-rule pt-[3vh]"><p>Markdown or Word: an AI-generated technical specification</p></div>
      </div>
      <p className="mt-[6vh]! deck-copy text-accent">Review approval unlocks SQL and specification actions</p>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>06</span></div>
  </div>;
}
