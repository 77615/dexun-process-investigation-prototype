import fs from 'node:fs';const p='prototype/figma-make-hunting/src/App.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("const [dock, setDock] = useState<Dock>('normal')",`const [dock, setDock] = useState<Dock>('normal')
  const [queueCollapsed, setQueueCollapsed] = useState(false)
  const [split, setSplit] = useState(62)
  const splitRef = useRef<HTMLDivElement>(null)
  const resizeSplit = (clientY: number) => {
    const rect = splitRef.current?.getBoundingClientRect()
    if (!rect) return
    const minimum = Math.min(100, rect.height * .3)
    const y = Math.max(minimum, Math.min(rect.height - minimum, clientY - rect.top))
    setSplit(y / rect.height * 100)
    setDock('normal')
  }`);
s=s.replace('<div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">',`<div className="grid min-h-0 flex-1" style={{gridTemplateColumns: (queueCollapsed ? '56px' : '280px')+' minmax(0,1fr) 320px'}}>`);
s=s.replace('<Queue hosts={hosts}',`<section className="queue-region" data-collapsed={queueCollapsed}>
        <button className="queue-toggle" aria-label={queueCollapsed?'展开事件列表':'收起事件列表'} aria-expanded={!queueCollapsed} title={queueCollapsed?'展开事件列表':'收起事件列表'} onClick={()=>setQueueCollapsed(v=>!v)}><I d={queueCollapsed?P.chevron:'m15 18-6-6 6-6'}/></button>
        {queueCollapsed&&<span className="queue-rail-label">调查队列</span>}
        <section className="queue-content" hidden={queueCollapsed}><Queue hosts={hosts}`);
s=s.replace('onVisible={setVisible} />','onVisible={setVisible} /></section></section>');
s=s.replace('{/* structure view (chain or tree) */}',`<div ref={splitRef} className="investigation-split">
          {/* structure view (chain or tree) */}`);
s=s.replace('<div className={`min-h-0 overflow-auto scroll-thin ${dock === \'max\' ? \'h-0 flex-none\' : \'flex-1\'}`}>',`<div className="min-h-0 overflow-auto scroll-thin" style={{flex:dock==='max'?'0 0 0':dock==='min'?'1 1 0':split+' 1 0'}}>`);
s=s.replace('{/* shared timeline dock: the evidence spine for both structure views */}',`<section className="split-handle" role="separator" aria-label="调整攻击链与时间线高度" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} tabIndex={0}
            onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resizeSplit(e.clientY)}}
            onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resizeSplit(e.clientY)}}
            onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
            onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setDock('normal');setSplit(v=>Math.max(30,Math.min(70,v+(e.key==='ArrowUp'?-5:5))))}}}
            onDoubleClick={()=>{setSplit(62);setDock('normal')}}><span/></section>
          {/* shared timeline dock */}`);
s=s.replace('<section className={`flex min-h-0 flex-col border-t border-line ${dock === \'max\' ? \'flex-1\' : dock === \'normal\' ? \'h-[38%] shrink-0\' : \'shrink-0\'}`}>',`<section className="flex min-h-0 flex-col border-t border-line" style={{flex:dock==='max'?'1 1 0':dock==='normal'?(100-split)+' 1 0':'0 0 40px'}}>`);
s=s.replace('onClick={() => setDock(d)}','onClick={() => {setDock(d);if(d===\'normal\')setSplit(62)}}');
s=s.replace('          </section>\n        </main>','          </section>\n          </div>\n        </main>');
fs.writeFileSync(p,s);
