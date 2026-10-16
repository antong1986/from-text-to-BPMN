const base = import.meta.env.BASE_URL;

export default function ProjectCover() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">PROJECT OVERVIEW</span></div>
    <div className="absolute left-[8vw] top-[28vh] w-[45vw]">
      <div className="inline-flex items-center gap-[0.7vw] rounded-full border border-primary/25 bg-primary/10 px-[1.2vw] py-[0.8vh] text-[1.5vw] text-primary">PLATFORM OVERVIEW</div>
      <h1 className="mt-[3vh]! text-[5.4vw] leading-[1.08] tracking-tight">Text-to-BPMN Studio</h1>
      <p className="mt-[3vh]! max-w-[42vw] text-[2vw] leading-[1.45] text-muted">Turn written process descriptions into editable BPMN diagrams and technical specifications.</p>
      <div className="mt-[4vh] h-[0.4vh] w-[4vw] rounded-full bg-primary"/>
    </div>
    <div className="absolute right-[4vw] top-[21vh] h-[58vh] w-[45vw]">
      <div className="absolute inset-[5vw] rounded-full bg-primary/15 blur-[6vw]"/>
      <img src={`${base}workflow-hero.png`} crossOrigin="anonymous" className="relative h-full w-full object-contain" alt="Isometric workflow illustration"/>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>01</span></div>
  </div>;
}
