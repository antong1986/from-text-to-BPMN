export default function ProcessLogic() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">THE PURPOSE</span></div>
    <div className="deck-content grid grid-cols-[0.9fr_1.25fr] items-center gap-[6vw]">
      <div><h1 className="text-[5.6vw] leading-[1.08]">Make process logic explicit</h1><div className="mt-[4vh] h-[0.5vh] w-[7vw] bg-primary"/></div>
      <ul className="deck-list deck-copy">
        <li>Turn narrative requirements into visible steps and decisions</li>
        <li>Separate human tasks from automated actions</li>
        <li>Show exceptions, rejection paths, and repetition loops</li>
        <li>Review the model before handing it to developers</li>
      </ul>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>02</span></div>
  </div>;
}
