export default function Architecture() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">THE ARCHITECTURE</span></div>
    <div className="deck-content">
      <h1 className="deck-heading">A clear frontend–backend boundary</h1>
      <div className="mt-[5vh] grid grid-cols-[1fr_5vw_1fr] gap-[2vw] items-stretch deck-copy">
        <div className="bg-primary text-bg rounded-[1.2vw] p-[2.4vw] flex flex-col gap-[4vh]">
          <p>React, Vite, TypeScript, and Tailwind power the interface</p>
          <p>bpmn-js renders and edits the process model</p>
        </div>
        <div className="self-center text-[5vw] text-primary">↔</div>
        <div className="deck-panel p-[2.4vw] flex flex-col gap-[4vh]">
          <p>Express sends server-side requests to Gemini</p>
          <p>API credentials stay on the server</p>
        </div>
      </div>
      <p className="mt-[5vh]! deck-copy text-accent">Same-origin /api routes connect frontend and backend</p>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>07</span></div>
  </div>;
}
