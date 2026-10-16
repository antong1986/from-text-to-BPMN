export default function Workflow() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">THE WORKFLOW</span></div>
    <div className="deck-content">
      <h1 className="deck-heading">Describe. Generate. Review. Export.</h1>
      <div className="mt-[5vh] grid grid-cols-[7vw_1fr] items-center gap-x-[3vw] gap-y-[2.1vh] deck-copy">
        <span className="text-[3.5vw] leading-none font-bold text-primary">01</span><p>Describe the business process in plain language</p>
        <span className="text-[3.5vw] leading-none font-bold text-primary">02</span><p>Generate a JSON graph with Gemini</p>
        <span className="text-[3.5vw] leading-none font-bold text-primary">03</span><p>Convert the graph into editable BPMN XML</p>
        <span className="text-[3.5vw] leading-none font-bold text-primary">04</span><p>Review and adjust the diagram on the canvas</p>
        <span className="text-[3.5vw] leading-none font-bold text-primary">05</span><p>Export the model and supporting documentation</p>
      </div>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>03</span></div>
  </div>;
}
