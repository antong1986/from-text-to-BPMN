export default function PizzaExample() {
  return <div className="w-screen h-screen overflow-hidden relative deck-frame">
    <div className="deck-header"><span>TEXT-TO-BPMN STUDIO</span><span className="deck-muted">ILLUSTRATIVE EXAMPLE</span></div>
    <div className="deck-content">
      <h1 className="deck-heading">Example: a pizza-order process</h1>
      <div className="mt-[5vh] grid grid-cols-[1.08fr_1fr] gap-[4vw]">
        <ul className="deck-list deck-copy">
          <li>Collect pizza type, quantity, delivery choice, and extras</li>
          <li>Check whether the customer's speech was understood</li>
          <li>If yes: save the order data to the database</li>
          <li>If no: ask the customer to repeat</li>
          <li>Represent repetition as a return loop</li>
        </ul>
        <div className="relative h-[52vh]">
          <svg viewBox="0 0 600 560" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Illustrative process flow with a retry loop">
            <defs><marker id="pizza-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#14b8a6"/></marker></defs>
            <path d="M290 100 V166 M290 284 V348 M290 418 V482" stroke="#14b8a6" strokeWidth="3" fill="none" markerEnd="url(#pizza-arrow)"/>
            <path d="M350 225 H535 V50 H445" stroke="#94a3b8" strokeWidth="3" fill="none" markerEnd="url(#pizza-arrow)"/>
            <rect x="135" y="5" width="310" height="95" rx="15" fill="#134e4a" stroke="#14b8a6" strokeWidth="2"/>
            <path d="M290 166 L350 225 L290 284 L230 225 Z" fill="#134e4a" stroke="#14b8a6" strokeWidth="2"/>
            <rect x="135" y="348" width="310" height="70" rx="15" fill="#134e4a" stroke="#14b8a6" strokeWidth="2"/>
            <circle cx="290" cy="515" r="32" fill="#0f172a" stroke="#14b8a6" strokeWidth="5"/>
          </svg>
          <p className="absolute left-[11vw] top-[1.8vh] w-[17vw] text-center text-[2vw] leading-[1.3]">Collect order details</p>
          <p className="absolute left-0 top-[19vh] w-[15vw] text-right text-[1.5vw] text-accent">Speech understood?</p>
          <p className="absolute left-[21vw] top-[27vh] text-[1.5vw] text-accent">Yes</p>
          <p className="absolute right-0 top-[13vh] w-[8vw] text-center text-[1.5vw] deck-muted">No: repeat</p>
          <p className="absolute left-[10vw] top-[33.5vh] w-[19vw] text-center text-[2vw]">Save to database</p>
        </div>
      </div>
    </div>
    <div className="deck-footer"><span>Text-to-BPMN Studio</span><span>04</span></div>
  </div>;
}
