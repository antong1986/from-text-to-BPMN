const base = import.meta.env.BASE_URL;

export default function NextSteps() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">CURRENT STATE &amp; NEXT STEPS</span></div>
    <div className="deck-content">
      <h1 className="deck-heading max-w-[82vw]">A working prototype with clear next steps</h1>
      <div className="mt-[5vh] grid grid-cols-[1.4fr_0.7fr] gap-[4vw] items-center">
        <ul className="deck-list deck-copy">
          <li>Core workflow: diagram generation, editing, and export</li>
          <li>Confirmed blocker: Gemini quota and availability can prevent live generation</li>
          <li>Current review prompts are scripted, not independent AI validation</li>
          <li>Next: quota-aware request handling and semantic process checks</li>
          <li>Validate end-to-end behavior before a production rollout</li>
        </ul>
        <img src={`${base}workflow-hero.png`} crossOrigin="anonymous" className="w-full h-[42vh] object-contain" alt="Isometric workflow illustration"/>
      </div>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>09</span></div>
  </div>;
}
