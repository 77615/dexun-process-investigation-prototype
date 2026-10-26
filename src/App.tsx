import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { navigate } from './HostInvestigation'
import { forestRows, processKey, capturedAt } from './process-model'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack } from '@astryxdesign/core/Layout'
import { HOSTS, STAGES, type HuntEvent, type Host, type Proc, type Severity, type StageKey } from './data'

/* ---------- primitives ---------- */
const I = ({ d, size = 14, className = '' }: { d: string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d={d} />
  </svg>
)
const P = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  chevron: 'm9 18 6-6-6-6',
  down: 'm6 9 6 6 6-6',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  x: 'M18 6 6 18M6 6l12 12',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  term: 'm4 17 6-6-6-6M12 19h8',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  warn: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  dockMin: 'M4 4h16v16H4zM4 17h16',
  check: 'M20 6 9 17l-5-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  up: 'm18 15-6-6-6 6',
  undo: 'M9 14 4 9l5-5M4 9h8a7 7 0 1 1-6.2 10',
  dockHalf: 'M4 4h16v16H4zM4 12h16',
  dockMax: 'M4 4h16v16H4zM4 7h16',
}
const SEV: Record<Severity, { label: string; fg: string; bg: string; bd: string }> = {
  critical: { label: '严重', fg: '#CB2634', bg: '#FFECE8', bd: '#FDCDC5' },
  high: { label: '高危', fg: '#F53F3F', bg: '#FFF2F0', bd: '#FDCDC5' },
  medium: { label: '中危', fg: '#D25F00', bg: '#FFF7E8', bd: '#FFD8A8' },
  low: { label: '低危', fg: '#4E5969', bg: '#F2F3F5', bd: '#E5E6EB' },
}
/** Node status palette — the only semantic color set inside the investigation area. */
const ST = {
  pending: { label: '待处理', c: '#F53F3F', bg: '#FFF2F0' },
  handled: { label: '已处理', c: '#165DFF', bg: '#E8F3FF' },
  normal: { label: '普通证据', c: '#86909C', bg: '#F7F8FA' },
}
type Status = keyof typeof ST
const stageOf = (k: StageKey) => STAGES.find((s) => s.key === k)!
const Tag = ({ children, fg, bg, bd }: { children: ReactNode; fg: string; bg: string; bd?: string }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[12px]" style={{ color: fg, background: bg, borderColor: bd ?? 'transparent' }}>{children}</span>
)
function Btn({ children, onClick, tone = 'default', disabled, className = '' }: { children: ReactNode; onClick?: () => void; tone?: 'primary' | 'danger' | 'default' | 'link'; disabled?: boolean; className?: string }) {
  const tones = {
    primary: 'h-8 px-3 bg-brand-6 text-white hover:bg-[#4080ff]',
    danger: 'h-8 px-3 bg-red-6 text-white hover:bg-[#f76560]',
    default: 'h-8 px-3 bg-white text-text-5 border border-line hover:border-brand-6 hover:text-brand-6',
    link: 'text-brand-6 hover:text-[#4080ff]',
  }
  return (
    <button disabled={disabled} onClick={onClick} className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]} ${className}`}>{children}</button>
  )
}
const SectionTitle = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="mb-3 flex items-center justify-between"><h3 className="text-[14px] font-semibold">{children}</h3>{extra}</div>
)

/* ---------- app state ---------- */
type Log = { id: number; time: string; text: string; target: string; state: 'running' | 'done' | 'queued' }
type Verdict = 'attack' | 'fp'
/** A disposition added manually from a node; AI-plan items are referenced by PlanKey instead. */
type Manual = { id: string; kind: 'kill' | 'killTree' | 'quarantineProc'; node: string; title: string; target: string }
type MenuItem = { label: string; run: () => void; hint?: string; recommended?: boolean; added?: boolean }
/** Unified selection treatment for every list row in the workspace. */
const SEL = 'bg-brand-1 shadow-[inset_2px_0_0_#165DFF]'
const EV_TONE: Record<string, string> = { 待研判: 'text-[#D25F00] bg-[#FFF7E8]', 处置中: 'text-brand-6 bg-brand-1', 已遏制: 'text-text-4 bg-fill-2', 已关闭: 'text-text-3 bg-fill-2' }
type View = 'chain' | 'tree'
type Dock = 'min' | 'normal' | 'max'
const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

export default function App({ route = "" }: { route?: string }) {
  const [hosts, setHosts] = useState<Host[]>(HOSTS)
  const [sel, setSel] = useState({ host: 'h1', event: 'INC-3201' })
  const [view, setView] = useState<View>('chain')
  const [dock, setDock] = useState<Dock>('normal')
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
  }
  const [node, setNode] = useState('p3')
  const previousRoute = useRef(route)
  const workspaceSnapshots = useRef(new Map<string, {sel: {host:string;event:string}; node:string; view:View; dock:Dock; split:number}>())
  useEffect(() => {
    const previous = previousRoute.current
    if (previous === '/' || previous.startsWith('/?')) workspaceSnapshots.current.set(previous, {sel,node,view,dock,split})
    previousRoute.current = route
    if (route !== '/' && !route.startsWith('/?')) return
    const cached = workspaceSnapshots.current.get(route)
    if (cached && previous !== route) { setSel(cached.sel); setNode(cached.node); setView(cached.view); setDock(cached.dock); setSplit(cached.split); return }
    const p = new URLSearchParams(route.split('?')[1]); const h = HOSTS.find(h => h.id === p.get('host')); const e = h?.events.find(e => e.id === p.get('event'))
    if (h && e) { setSel({host:h.id,event:e.id}); setNode(e.procs.some(x => x.id === p.get('node')) ? p.get('node')! : e.procs[0]?.id || 'host') }
  }, [route])
  const [hover, setHover] = useState<string | null>(null)
  const [killed, setKilled] = useState<Set<string>>(new Set())
  const [blocked, setBlocked] = useState<Set<string>>(new Set())
  const [quarantined, setQuarantined] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<(Log & { event: string })[]>([])
  const [drawer, setDrawer] = useState(false)
  const [confirm, setConfirm] = useState<null | { title: string; body: ReactNode; run: () => void }>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [evStatus, setEvStatus] = useState<Record<string, HuntEvent['status']>>({})
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [help, setHelp] = useState(false)
  const [cleaned, setCleaned] = useState<Set<string>>(new Set())
  const [picks, setPicks] = useState<Record<string, string[]>>({})
  const [manual, setManual] = useState<Record<string, Manual[]>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; node: string } | null>(null)
  const [visible, setVisible] = useState<{ host: string; event: string }[] | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const host = hosts.find((h) => h.id === sel.host)!
  const event = host.events.find((e) => e.id === sel.event) ?? host.events[0]
  const k = (id: string) => `${event.id}:${id}`
  const allEvents = useMemo(() => hosts.flatMap((h) => h.events.map((e) => ({ host: h.id, event: e.id }))), [hosts])
  const flat = visible && visible.length > 0 ? visible : allEvents

  const closedEv = (evStatus[event.id] ?? event.status) === '已关闭'
  // Processes that planted persistence stay pending until persistence is removed, even if killed.
  const persistProcs = new Set(event.timeline.filter((t) => t.stage === 'persistence').map((t) => t.proc))
  const ipIocs = event.iocs.filter((i) => i.type === 'IP')
  const statusOf = (id: string): Status => {
    if (closedEv) return 'normal'
    if (id === 'host') return host.isolated ? 'handled' : 'pending'
    if (id === 'src') return ipIocs.length === 0 ? 'normal' : ipIocs.every((i) => blocked.has(i.value)) ? 'handled' : 'pending'
    if (id === 'art') return quarantined.has(k('art')) ? 'handled' : 'pending'
    if (id === 'entry') return 'normal'
    const p = event.procs.find((x) => x.id === id)
    if (!p) return 'normal'
    if (persistProcs.has(id)) return cleaned.has(event.id) ? 'handled' : 'pending'
    if (killed.has(k(id))) return 'handled'
    return p.malicious || p.suspicious ? 'pending' : 'normal'
  }
  const statusOfEvent = (e: HuntEvent) => evStatus[e.id] ?? e.status
  const evState = statusOfEvent(event)
  const setState = (s: HuntEvent['status']) => setEvStatus((m) => ({ ...m, [event.id]: s }))
  const pendingAlerts = event.timeline.filter((t) => statusOf(t.proc) === 'pending').length

  const pickEvent = (hostId: string, e: HuntEvent) => {
    setSel({ host: hostId, event: e.id })
    setHover(null)
    setNode((e.procs.find((p) => p.malicious) ?? e.procs[0]).id)
  }
  const flash = (t: string) => { clearTimeout(toastTimer.current); setToast(t); toastTimer.current = setTimeout(() => setToast(null), 2200) }
  const act = (text: string, target: string, apply?: () => void, readonly = false) => {
    const id = Date.now() + Math.random()
    if (readonly) {
      // Read-only lookups run immediately and never change the event's disposition state.
      setLogs((l) => [{ id, event: event.id, time: now(), text, target, state: 'done' }, ...l])
      return
    }
    if (evState === '待研判') setState('处置中')
    if (!host.online) {
      // Offline endpoints queue the task; it runs when the agent reconnects.
      setLogs((l) => [{ id, event: event.id, time: now(), text, target, state: 'queued' }, ...l])
      flash(`主机离线，已排队：${text}`)
      return
    }
    setLogs((l) => [{ id, event: event.id, time: now(), text, target, state: 'running' }, ...l])
    setTimeout(() => { apply?.(); setLogs((l) => l.map((x) => (x.id === id ? { ...x, state: 'done' } : x))) }, 900)
    flash(`已下发：${text}`)
  }
  const descendants = (id: string): string[] => [id, ...event.procs.filter((p) => p.parent === id).flatMap((c) => descendants(c.id))]

  const manualOf = manual[event.id] ?? []
  const rootProc = event.procs.find((p) => p.malicious) ?? event.procs[0]
  const rootTree = descendants(rootProc.id)
  const rootTreeOpen = rootTree.some((id) => !persistProcs.has(id) && statusOf(id) === 'pending')
  const planLabel: Record<PlanKey, string> = { isolate: '隔离主机', killTree: '终止恶意进程树', persist: '清除持久化', block: '封禁 IOC', quarantine: '隔离落地文件' }
  const isPicked = (key: string) => picks[event.id] === undefined || picks[event.id].includes(key)
  const ensurePick = (key: string) => {
    setPicks((m) => (m[event.id] === undefined || m[event.id].includes(key) ? m : { ...m, [event.id]: [...m[event.id], key] }))
  }
  const ensureAi = (key: PlanKey) => { ensurePick(key); flash(`「${planLabel[key]}」已在处置清单中勾选`) }
  const addManual = (m: Omit<Manual, 'id'>) => {
    if (manualOf.some((x) => x.kind === m.kind && x.node === m.node)) return flash('该动作已在处置清单中')
    // Dedupe against the AI plan: the root process tree already covers its descendants.
    if ((m.kind === 'kill' || m.kind === 'killTree') && rootTreeOpen && rootTree.includes(m.node) && !persistProcs.has(m.node)) {
      ensurePick('killTree')
      return flash('已包含在「终止恶意进程树」中，无需重复添加')
    }
    const id = `m-${Date.now()}`
    setManual((all) => ({ ...all, [event.id]: [...(all[event.id] ?? []), { ...m, id }] }))
    ensurePick(id)
    flash(`已加入处置清单：${m.title}`)
  }
  const removeManual = (ids: string[]) => setManual((all) => ({ ...all, [event.id]: (all[event.id] ?? []).filter((x) => !ids.includes(x.id)) }))

  const menuFor = (id: string): { title: string; readonly: MenuItem[]; plan: MenuItem[] } => {
    const p = event.procs.find((x) => x.id === id)
    const has = (kind: Manual['kind']) => manualOf.some((x) => x.kind === kind && x.node === id)
    if (p) {
      const ro: MenuItem[] = [
        { label: '全网狩猎此哈希', run: () => { act('全网狩猎哈希', p.sha256, undefined, true); flash(`全网狩猎已发起：${p.sha256}`) } },
        { label: '复制命令行', run: () => { navigator.clipboard?.writeText(p.cmd); flash('命令行已复制') } },
      ]
      if (persistProcs.has(id)) {
        return { title: `${p.name} · PID ${p.pid}`, readonly: ro, plan: [
          { label: '清除持久化', recommended: true, added: cleaned.has(event.id) || isPicked('persist'), run: () => ensureAi('persist') },
          { label: '终止进程', hint: '该进程写入了持久化，仅终止会被再次拉起', added: has('kill'), run: () => addManual({ kind: 'kill', node: id, title: `终止进程 ${p.name}`, target: `PID ${p.pid}` }) },
        ] }
      }
      return { title: `${p.name} · PID ${p.pid}`, readonly: ro, plan: [
        { label: '终止进程', added: has('kill'), run: () => addManual({ kind: 'kill', node: id, title: `终止进程 ${p.name}`, target: `PID ${p.pid}` }) },
        { label: '终止进程树', added: has('killTree') || (id === rootProc.id && isPicked('killTree')), run: () => (id === rootProc.id ? ensureAi('killTree') : addManual({ kind: 'killTree', node: id, title: `终止进程树 ${p.name}`, target: `PID ${p.pid} 及子进程` })) },
        { label: '隔离进程文件', added: has('quarantineProc'), run: () => addManual({ kind: 'quarantineProc', node: id, title: `隔离进程文件 ${p.name}`, target: p.cmd.split(' ')[0] }) },
      ] }
    }
    if (id === 'art') return { title: event.artifact.label, readonly: [
      { label: '全网狩猎此文件', run: () => { act('全网狩猎文件', event.artifact.sub, undefined, true); flash('全网狩猎已发起') } },
      { label: '复制路径', run: () => { navigator.clipboard?.writeText(event.artifact.sub); flash('路径已复制') } },
    ], plan: [{ label: '隔离文件', added: isPicked('quarantine'), run: () => ensureAi('quarantine') }] }
    if (id === 'src') return { title: event.source.sub, readonly: [
      { label: '威胁情报查询', run: () => flash(`威胁情报：${event.source.sub} · ${ipIocs.length ? '恶意 · 已知 C2 基础设施' : '钓鱼邮件发件域'}`) },
    ], plan: ipIocs.length ? [{ label: '封禁 IP', added: isPicked('block'), run: () => ensureAi('block') }] : [] }
    if (id === 'host') return { title: host.name, readonly: [], plan: [{ label: host.isolated ? '主机已隔离' : '隔离主机', added: host.isolated || isPicked('isolate'), run: () => ensureAi('isolate') }] }
    return { title: event.entry.label, readonly: [{ label: '复制入口信息', run: () => { navigator.clipboard?.writeText(event.entry.sub); flash('已复制') } }], plan: [] }
  }
  const openMenu = (nodeId: string, x: number, y: number) => { setNode(nodeId); setMenu({ node: nodeId, x, y }) }
  const inPlan = (nodeId: string) => manualOf.some((m) => m.node === nodeId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || (e.target as HTMLElement).tagName === 'INPUT') return
      const key = e.key.toLowerCase()
      if (key === 'escape') { setDrawer(false); setHelp(false); setMenu(null) }
      if (e.key === '?') { setHelp((v) => !v); return }
      if (drawer) return
      if (key === 'j' || key === 'k') {
        const i = flat.findIndex((f) => f.host === sel.host && f.event === event.id)
        const n = flat[(i + (key === 'j' ? 1 : -1) + flat.length) % flat.length]
        pickEvent(n.host, hosts.find((h) => h.id === n.host)!.events.find((x) => x.id === n.event)!)
      } else if (key === '1') setView('chain')
      else if (key === '2') setView('tree')
      else if (key === 'l') setDock((d) => (d === 'min' ? 'normal' : 'min'))
      else if (key === 'p') setDrawer(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const firstSeen = event.timeline[0]?.time ?? event.time
  const lastSeen = event.timeline[event.timeline.length - 1]?.time ?? event.time

  return (
    <div className="flex h-screen min-w-[1180px] flex-col bg-white font-sans text-[13px] text-text-5">
      <TopBar onHelp={() => setHelp((v) => !v)} />
      <div className="grid min-h-0 flex-1" style={{gridTemplateColumns: (queueCollapsed ? '56px' : '280px')+' minmax(0,1fr) 320px'}}>
        <section className="queue-region" data-collapsed={queueCollapsed}>
        <button className="queue-toggle" aria-label={queueCollapsed?'展开事件列表':'收起事件列表'} aria-expanded={!queueCollapsed} title={queueCollapsed?'展开事件列表':'收起事件列表'} onClick={()=>setQueueCollapsed(v=>!v)}><I d={queueCollapsed?P.chevron:'m15 18-6-6 6-6'}/></button>
        {queueCollapsed&&<span className="queue-rail-label">调查队列</span>}
        <section className="queue-content" hidden={queueCollapsed}><Queue focusNode={node} hosts={hosts} sel={sel} onPick={pickEvent} statusOf={statusOfEvent} onVisible={setVisible} /></section></section>

        {/* ---------- investigation ---------- */}
        <main className="investigation-main flex min-h-0 flex-col border-x border-line">
          <header className="border-b border-line px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 text-[12px] text-text-3">主机调查 · {event.id}</div>
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-[20px] font-semibold">{event.title}</h1>
                  <Tag {...SEV[event.severity]}>{SEV[event.severity].label}</Tag>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {evState === '处置中' && pendingAlerts === 0 && <Btn onClick={() => { setState('已遏制'); flash('事件已标记为已遏制') }}><I d={P.shield} />标记为已遏制</Btn>}
                {(evState === '已关闭' || evState === '已遏制') ? (
                  <Btn onClick={() => {
                    setState(logs.some((l) => l.event === event.id) ? '处置中' : '待研判')
                    if (verdicts[event.id] === 'fp') setVerdicts((m) => { const n = { ...m }; delete n[event.id]; return n })
                    flash(`${event.id} 已重新打开`)
                  }}><I d={P.undo} />重新打开</Btn>
                ) : <Btn tone="primary" onClick={() => setDrawer(true)}>处置方案</Btn>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              {[`入口：${event.entry.label}`, `主机：${host.name} · ${host.ip}`, `首次 ${firstSeen}`, `最近 ${lastSeen}`].map((t) => (
                <span key={t} className="rounded bg-fill-2 px-2 py-0.5 text-text-4">{t}</span>
              ))}
              <span className={`rounded px-2 py-0.5 ${EV_TONE[evState]}`}>{evState}</span>
              {!host.online && <span className="rounded bg-fill-2 px-2 py-0.5 text-text-3">主机离线</span>}
              {host.isolated && <span className="rounded bg-brand-1 px-2 py-0.5 text-brand-6">主机已隔离</span>}
              <span className={`ml-auto rounded border px-2 py-0.5 ${closedEv ? 'border-transparent bg-fill-2 text-text-3' : pendingAlerts ? 'border-[#FDCDC5] bg-[#FFF2F0] text-red-6' : 'border-transparent bg-brand-1 text-brand-6'}`}>
                {closedEv ? '已判定误报 · 无需处置' : pendingAlerts ? `${pendingAlerts} 条待处理` : '告警已全部处理'}
              </span>
            </div>
          </header>

          <AiInsight event={event} verdict={verdicts[event.id]} onPick={setNode} onHover={setHover} />

          <nav className="flex items-center gap-6 border-b border-line px-6">
            {([['chain', '攻击链'], ['tree', '进程树']] as [View, string][]).map(([v, t], i) => (
              <button key={v} onClick={() => setView(v)} className={`-mb-px flex h-11 cursor-pointer items-center gap-1.5 border-b-2 ${view === v ? 'border-brand-6 font-medium text-brand-6' : 'border-transparent text-text-4 hover:text-text-5'}`}>
                {t}
              </button>
            ))}
            <span className="ml-auto text-[12px] text-text-3">同一组数据的两种结构 · 下方时间线共享联动</span>
          </nav>

          <div ref={splitRef} className="investigation-split">
          {/* structure view (chain or tree) */}
          <div className="min-h-0 overflow-auto scroll-thin" style={{flex:dock==='max'?'0 0 0':dock==='min'?'1 1 0':split+' 1 0'}}>
            {view === 'chain' && <ChainGraph event={event} host={host} node={node} hover={hover} onHover={setHover} onPick={setNode} statusOf={statusOf} onMenu={openMenu} inPlan={inPlan} />}
            {view === 'tree' && <ProcessTree processes={event.procs} records={event.timeline} mainPath={event.mainPath} node={node} hover={hover} onHover={setHover} onPick={setNode} statusOf={statusOf} onMenu={openMenu} inPlan={inPlan} />}
          </div>

          <section className="split-handle" role="separator" aria-label="调整攻击链与时间线高度" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} tabIndex={0}
            onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resizeSplit(e.clientY)}}
            onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resizeSplit(e.clientY)}}
            onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
            onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setDock('normal');setSplit(v=>Math.max(30,Math.min(70,v+(e.key==='ArrowUp'?-5:5))))}}}
            onDoubleClick={()=>{setSplit(62);setDock('normal')}}><span/></section>
          {/* shared timeline dock */}
          <section className="flex min-h-0 flex-col border-t border-line" style={{flex:dock==='max'?'1 1 0':dock==='normal'?(100-split)+' 1 0':'0 0 40px'}}>
            <div className="flex h-10 shrink-0 items-center gap-3 px-6">
              <b className="text-[13px] font-semibold">告警时间线</b>
              <span className="text-[12px] text-text-3">{event.timeline.length} 条 · {firstSeen} — {lastSeen}</span>
              <span className="text-[12px] text-text-3">· 悬停查看{view === 'chain' ? '攻击路径' : '进程血缘'}</span>
              <div className="ml-auto flex items-center rounded bg-fill-2 p-0.5" role="group" aria-label="时间线高度">
                {([['min', '收起时间线', P.dockMin], ['normal', '默认高度', P.dockHalf], ['max', '展开时间线', P.dockMax]] as [Dock, string, string][]).map(([d, t, icon]) => (
                  <button key={d} onClick={() => {setDock(d);if(d==='normal')setSplit(62)}} title={t} aria-label={t} aria-pressed={dock === d} className={`grid size-6 cursor-pointer place-items-center rounded ${dock === d ? 'bg-white text-brand-6 shadow-sm' : 'text-text-3 hover:text-text-5'}`}>
                    <I d={icon} size={14} />
                  </button>
                ))}
              </div>
            </div>
            {dock !== 'min' && (
              <div className="min-h-0 flex-1 overflow-auto scroll-thin">
                <Timeline detailed={dock === 'max'} event={event} node={node} hover={hover} onHover={setHover} onPick={setNode} statusOf={statusOf} />
              </div>
            )}
          </section>
          </div>
        </main>

        <NodePanel onMenu={openMenu} event={event} host={host} node={node} hover={hover} onHover={setHover} logs={logs.filter((l) => l.event === event.id)} statusOf={statusOf} onPick={setNode} flash={flash} onOpenPlan={() => setDrawer(true)} pendingAlerts={pendingAlerts} />
      </div>

      {drawer && (
        <PlanDrawer
          event={event} host={host} node={node} statusOf={statusOf} blocked={blocked}
          verdict={verdicts[event.id]} setVerdict={(v) => setVerdicts((m) => ({ ...m, [event.id]: v }))}
          onFalsePositive={() => { setState('已关闭'); setDrawer(false); flash(`${event.id} 已标记为误报并关闭`) }}
          pick={picks[event.id]} setPick={(p) => setPicks((m) => ({ ...m, [event.id]: p }))}
          manual={manualOf} onRemoveManual={removeManual}
          persistence={event.timeline.filter((t) => t.stage === 'persistence')} cleaned={cleaned.has(event.id)}
          logs={logs.filter((l) => l.event === event.id)}
          onClose={() => setDrawer(false)}
          onConfirm={setConfirm}
          actions={{
            isolate: () => act(host.isolated ? '解除隔离' : '隔离主机', `${host.name} · ${host.ip}`, () => setHosts((hs) => hs.map((h) => (h.id === host.id ? { ...h, isolated: !h.isolated } : h)))),
            killTree: (p: Proc) => act('终止进程树', `${p.name}(${p.pid}) 及 ${descendants(p.id).length - 1} 个子进程`, () => setKilled((s) => new Set([...s, ...descendants(p.id).map(k)]))),
            kill: (p: Proc) => act('终止进程', `${p.name}(${p.pid})`, () => setKilled((s) => new Set([...s, k(p.id)]))),
            block: () => act('封禁 IOC', `${event.iocs.length} 个指标 · 全网下发`, () => setBlocked((s) => new Set([...s, ...event.iocs.map((i) => i.value)]))),
            quarantine: () => act('隔离文件', event.artifact.sub, () => setQuarantined((s) => new Set([...s, k('art')]))),
            hunt: (p: Proc) => act('全网狩猎哈希', p.sha256),
            quarantineProc: (p: Proc) => act('隔离文件', p.cmd.split(' ')[0]),
            persist: () => act('清除持久化', event.timeline.filter((t) => t.stage === 'persistence').map((t) => t.detail).join('；'), () => setCleaned((s) => new Set([...s, event.id]))),
          }}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30" onClick={() => setConfirm(null)}>
          <div className="w-[420px] rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-[16px] font-semibold"><I d={P.warn} size={18} className="text-[#FF7D00]" />{confirm.title}</h3>
            <div className="mt-2 pl-[26px] leading-6 text-text-4">{confirm.body}</div>
            <div className="mt-5 flex justify-end gap-2">
              <Btn onClick={() => setConfirm(null)}>取消</Btn>
              <Btn tone="danger" onClick={() => { confirm.run(); setConfirm(null) }}>确认执行</Btn>
            </div>
          </div>
        </div>
      )}
      {menu && (() => {
        const m = menuFor(menu.node)
        const locked = evState === '已关闭'
        const Item = ({ it, plan }: { it: MenuItem; plan?: boolean }) => (
          <button disabled={(plan && locked) || it.added} onClick={() => { it.run(); setMenu(null) }} className="flex w-full cursor-pointer items-start gap-2 rounded px-2.5 py-1.5 text-left hover:bg-fill-2 disabled:cursor-default disabled:hover:bg-transparent">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={it.added ? 'text-text-3' : ''}>{it.label}</span>
                {it.recommended && !it.added && <span className="rounded bg-brand-1 px-1 text-[12px] text-brand-6">推荐</span>}
              </span>
              {it.hint && <span className="mt-0.5 flex items-center gap-1 text-[12px] text-[#D25F00]"><I d={P.warn} size={12} />{it.hint}</span>}
            </span>
            {plan && (it.added ? <span className="flex items-center gap-1 text-[12px] text-brand-6"><I d={P.check} size={12} />已在清单</span> : <span className="text-[12px] text-text-3">加入方案</span>)}
          </button>
        )
        return (
          <div className="fixed inset-0 z-[65]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
            <div className="absolute w-64 rounded-lg border border-line bg-white py-1.5 shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 280) }} onClick={(e) => e.stopPropagation()}>
              <div className="truncate px-3 pt-1 pb-2 font-mono text-[12px] text-text-3">{m.title}</div>
              {m.readonly.length > 0 && (
                <div className="px-1">
                  <div className="px-2 pb-1 text-[12px] text-text-3">查询（立即执行）</div>
                  {m.readonly.map((it) => <Item key={it.label} it={it} />)}
                </div>
              )}
              {m.plan.length > 0 && (
                <div className="mt-1 border-t border-line px-1 pt-1.5">
                  <div className="px-2 pb-1 text-[12px] text-text-3">{locked ? '事件已关闭，无法处置' : '处置（加入方案，统一确认执行）'}</div>
                  {m.plan.map((it) => <Item key={it.label} it={it} plan />)}
                </div>
              )}
              {!locked && m.plan.length > 0 && (
                <button onClick={() => { setMenu(null); setDrawer(true) }} className="mt-1 flex w-full cursor-pointer items-center justify-between border-t border-line px-3.5 pt-2 pb-1 text-[12px] text-brand-6">查看处置清单<I d={P.arrow} size={12} /></button>
              )}
            </div>
          </div>
        )
      })()}
      {help && (
        <div className="fixed top-14 right-5 z-[55] w-64 rounded-lg border border-line bg-white p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between"><b className="font-semibold">快捷键</b><button onClick={() => setHelp(false)} className="cursor-pointer text-text-3 hover:text-text-5"><I d={P.x} /></button></div>
          {[['J / K', '上 / 下一个事件'], ['1 / 2', '攻击链 / 进程树'], ['L', '收起 / 展开时间线'], ['P', '打开处置方案'], ['Esc', '关闭抽屉'], ['?', '显示快捷键']].map(([a, b]) => (
            <div key={a} className="flex justify-between py-1"><span className="text-text-4">{b}</span><kbd>{a}</kbd></div>
          ))}
        </div>
      )}
      {toast && <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded bg-text-5 px-4 py-2 text-white shadow-lg">{toast}</div>}
    </div>
  )
}

/* ---------- top bar ---------- */
function TopBar({ onHelp }: { onHelp: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-white px-5">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-text-3">工作区</span><span className="text-text-3">/</span><span className="text-text-3">威胁检测</span><span className="text-text-3">/</span><b className="font-medium">威胁猎杀</b>
      </div>
      <div className="ml-auto flex h-8 w-[280px] items-center gap-2 rounded border border-line bg-fill-2 px-3 text-text-3">
        <I d={P.search} /><input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-3" placeholder="搜索主机 / 进程 / 哈希 / IP" />
      </div>
      <button className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-line px-3 text-[12px] font-semibold">
        <img src="/assets/robot.png" alt="" className="size-5" />AI COPILOT<span className="grid size-4 place-items-center rounded-full bg-brand-6 text-[10px] text-white">2</span>
      </button>
      <button onClick={onHelp} title="快捷键 (?)" className="grid size-7 cursor-pointer place-items-center rounded-full border border-line text-[12px] text-text-4 hover:border-brand-6 hover:text-brand-6">?</button>
      <I d={P.bell} size={16} className="text-text-4" />
      <div className="flex items-center gap-2">
        <div className="text-right leading-4"><div className="text-[13px] font-semibold">冯国安</div><div className="text-[12px] text-text-3">管理员</div></div>
        <img src="/assets/avatar.png" alt="" className="size-8 rounded-full" />
      </div>
    </header>
  )
}

/* ---------- queue (A grouping + B fields) ---------- */
function Queue({ focusNode, hosts, sel, onPick, statusOf, onVisible }: { focusNode: string; hosts: Host[]; sel: { host: string; event: string }; onPick: (h: string, e: HuntEvent) => void; statusOf: (e: HuntEvent) => HuntEvent['status']; onVisible: (v: { host: string; event: string }[]) => void }) {
  const [sev, setSev] = useState<'all' | Severity>('all')
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const total = hosts.reduce((n, h) => n + h.events.length, 0)
  const groups = hosts
    .map((h) => ({ h, evs: h.events.filter((e) => (sev === 'all' || e.severity === sev) && `${h.name}${h.ip}${e.title}${e.id}`.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g) => g.evs.length > 0)
  const visibleKey = groups.flatMap((g) => g.evs.map((e) => `${g.h.id}|${e.id}`)).join(',')
  useEffect(() => {
    onVisible(visibleKey ? visibleKey.split(',').map((x) => { const [host, event] = x.split('|'); return { host, event } }) : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey])
  return (
    <aside className="flex min-h-0 flex-col bg-white">
      <div className="px-4 pt-4 pb-3">
        <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[14px] font-semibold">调查队列</h2><span className="text-[12px] text-text-3">{total} 事件</span></div>
        <div className="mb-2 flex h-8 items-center gap-2 rounded border border-line px-2.5 text-text-3 focus-within:border-brand-6">
          <I d={P.search} size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-3" placeholder="搜索主机、IP 或事件" />
        </div>
        <div className="grid grid-cols-5 rounded bg-fill-2 p-0.5 text-[12px]">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
            <button key={s} onClick={() => setSev(s)} className={`h-7 cursor-pointer rounded ${sev === s ? 'bg-white font-medium text-brand-6 shadow-sm' : 'text-text-4 hover:text-text-5'}`}>{s === 'all' ? '全部' : SEV[s].label}</button>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[12px] text-text-3"><span>按主机分组</span><span>{groups.reduce((n, g) => n + g.evs.filter((e) => statusOf(e) === '待研判').length, 0)} 待研判</span></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 scroll-thin">
        {groups.length === 0 && (
          <div className="py-10 text-center text-[12px] text-text-3">没有匹配的事件
            <button onClick={() => { setQ(''); setSev('all') }} className="mt-2 block w-full cursor-pointer text-brand-6">清除筛选</button>
          </div>
        )}
        {groups.map(({ h, evs }) => {
          const open = !closed.has(h.id)
          const top = (['critical', 'high', 'medium', 'low'] as const).find((k) => evs.some((e) => e.severity === k))
          const pending = evs.filter((e) => statusOf(e) === '待研判').length
          const hostSelected = sel.host === h.id
          const detailUrl = `/hosts/${h.id}/process-investigation?from=${capturedAt-86400000}&to=${capturedAt}${hostSelected && h.events.find(e=>e.id===sel.event)?.procs.some(p=>p.id===focusNode) ? `&event=${sel.event}&process=${encodeURIComponent(processKey(h.id,sel.event,focusNode))}` : ''}`
          return (
            <div key={h.id} className={`host-group ${hostSelected ? 'is-current' : ''}`}>
              <div className="host-group-head" title={`${h.name} · ${h.group} · ${h.os}`}>
                <button onClick={() => setClosed((s) => { const n = new Set(s); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n })} aria-expanded={open} className="host-group-toggle">
                  <I d={P.down} size={12} className={`shrink-0 text-text-3 transition-transform ${open ? '' : '-rotate-90'}`} />
                  <span className={`host-status-dot ${h.online ? 'online' : ''}`} aria-label={h.online ? '在线' : '离线'} />
                  <b className="font-mono text-[13px] font-semibold">{h.ip}</b>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-text-3">{h.name}</span>
                  {h.isolated && <span className="host-tag brand">已隔离</span>}
                  {pending > 0 && <span className="host-count" style={top ? { color: SEV[top].fg, background: SEV[top].bg } : undefined} title={`${pending} 个待研判 / 共 ${evs.length} 个事件`}>{pending}</span>}
                </button>
                <a href={detailUrl} className="host-detail-btn" aria-label={`打开 ${h.name} 主机详情（进程调查）`} title="主机详情 · 进程调查" onClick={(ev) => { ev.preventDefault(); navigate(detailUrl) }}>
                  <span>详情</span><I d="m9 6 6 6-6 6" size={12} />
                </a>
              </div>
              {open && (
                <div className="host-events">
                  {evs.map((e) => {
                    const active = sel.host === h.id && sel.event === e.id
                    return (
                      <button key={e.id} onClick={() => onPick(h.id, e)} className={`host-event ${active ? 'active' : ''}`} style={{ '--sev': SEV[e.severity].fg } as import("react").CSSProperties}>
                        <div className={`truncate ${active ? 'font-medium text-brand-6' : ''}`}>{e.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[12px]">
                          <span className={statusOf(e) === '待研判' ? 'font-medium text-[#f53f3f]' : 'text-text-3'}>{statusOf(e)}</span>
                          <span className="ml-auto tabular-nums text-text-3">{e.time.slice(0, 5)}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

/* ---------- attack chain graph ---------- */
type GNode = { id: string; label: string; sub: string; icon: string; shape: 'circle' | 'hex' }
function ChainGraph({ event, host, node, hover, onHover, onPick, statusOf, onMenu, inPlan }: { event: HuntEvent; host: Host; node: string; hover: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void; statusOf: (id: string) => Status; onMenu: (id: string, x: number, y: number) => void; inPlan: (id: string) => boolean }) {
  const [zoom, setZoom] = useState(1)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [event.id])
  const main: GNode[] = [
    { id: 'src', label: event.source.label, sub: event.source.sub, icon: P.target, shape: 'circle' },
    { id: 'entry', label: event.entry.label, sub: event.entry.sub, icon: P.warn, shape: 'circle' },
    { id: 'host', label: '受害主机', sub: host.ip, icon: P.server, shape: 'hex' },
    ...event.mainPath.map((id) => { const p = event.procs.find((x) => x.id === id)!; return { id, label: p.name, sub: `PID ${p.pid}`, icon: P.term, shape: 'circle' as const } }),
    { id: 'art', label: event.artifact.label, sub: event.artifact.sub, icon: P.file, shape: 'circle' },
  ]
  const side = event.procs.filter((p) => !event.mainPath.includes(p.id))
  const alertsOn = (id: string) => event.timeline.filter((t) => t.proc === id).length
  // Path from the attack source to the hovered node; everything else dims while hovering.
  const path = (() => {
    if (!hover) return null
    const ids = main.map((n) => n.id)
    const i = ids.indexOf(hover)
    if (i >= 0) return new Set(ids.slice(0, i + 1))
    if (side.some((p) => p.id === hover)) return new Set([...ids.slice(0, ids.indexOf(event.mainPath[event.mainPath.length - 1]) + 1), hover, 'more'])
    return null
  })()
  const dimmed = (id: string) => !!path && !path.has(id)

  const Node = ({ n }: { n: GNode }) => {
    const st = ST[statusOf(n.id)]
    const active = node === n.id
    const count = alertsOn(n.id)
    return (
      <button onClick={() => onPick(n.id)} onContextMenu={(e) => { e.preventDefault(); onMenu(n.id, e.clientX, e.clientY) }} onMouseEnter={() => onHover(n.id)} onMouseLeave={() => onHover(null)} className={`group flex w-[96px] shrink-0 cursor-pointer flex-col items-center text-center transition-opacity duration-150 ${dimmed(n.id) ? 'opacity-25' : ''}`}>
        <span className="relative">
          <span className={`grid size-12 place-items-center border-2 transition-shadow ${n.shape === 'hex' ? 'rounded-[12px]' : 'rounded-full'} ${active || hover === n.id ? 'shadow-[0_0_0_4px_rgba(22,93,255,0.18)]' : 'group-hover:shadow-[0_0_0_4px_rgba(0,0,0,0.05)]'}`}
            style={{ borderColor: st.c, color: st.c, background: n.shape === 'hex' ? st.bg : '#fff' }}>
            <I d={n.icon} size={18} />
          </span>
          {inPlan(n.id) && <span title="已加入处置清单" className="absolute -bottom-1 -left-1 grid size-4 place-items-center rounded-full bg-brand-6 text-white ring-2 ring-white"><I d={P.check} size={10} /></span>}
          {count > 0 && <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[10px] text-white ring-2 ring-white" style={{ background: st.c }}>{count}</span>}
        </span>
        <span className={`mt-2 max-w-full truncate font-mono text-[12px] ${active ? 'font-semibold' : ''}`} style={{ color: statusOf(n.id) === 'normal' ? '#1D2129' : st.c }}>{n.label}</span>
        <span className="max-w-full truncate text-[12px] text-text-3">{n.sub}</span>
      </button>
    )
  }
  const Edge = ({ to }: { to: string }) => {
    const c = ST[statusOf(to)].c
    return <span className={`relative mb-9 min-w-6 flex-1 transition-all duration-150 ${path?.has(to) ? 'h-[3px]' : 'h-0.5'} ${dimmed(to) ? 'opacity-20' : ''}`} style={{ background: c }}><span className="absolute -top-[4px] -right-0.5 size-0 border-y-[5px] border-l-[7px] border-y-transparent" style={{ borderLeftColor: c }} /></span>
  }
  // side branch attaches to the last main-path process
  return (
    <div className="flex h-full min-h-[280px] flex-col px-6 py-3">
      <div className="flex items-center gap-3 text-[12px] text-text-4">
        <button className="cursor-pointer rounded px-1.5 hover:bg-fill-2" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}>−</button>
        <span className="w-9 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button className="cursor-pointer rounded px-1.5 hover:bg-fill-2" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(1)))}>+</button>
        <button className="cursor-pointer rounded px-1.5 hover:bg-fill-2" onClick={() => setZoom(1)}>适应</button>
        <span className="ml-auto text-text-3">主链已展开 · 次要分支{expanded ? '已展开' : '已聚合'}</span>
      </div>
      <div className="dotbg relative mt-3 flex-1 overflow-auto rounded border border-line">
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 rounded border border-line bg-white px-3 py-2 text-[12px] text-text-4 shadow-sm">
          {(Object.keys(ST) as Status[]).map((s) => <span key={s} className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: ST[s].c }} />{s === 'normal' ? '普通证据节点' : `${ST[s].label}告警节点`}</span>)}
        </div>
        <div className="flex min-h-full min-w-max origin-center items-center justify-center px-10 pt-24 pb-6" style={{ transform: `scale(${zoom})` }}>
          {main.map((n, i) => {
            const isBranchAnchor = n.id === event.mainPath[event.mainPath.length - 1] && side.length > 0
            return (
              <div key={n.id} className="flex items-center">
                {i > 0 && <Edge to={n.id} />}
                <div className="relative">
                  <Node n={n} />
                  {isBranchAnchor && (
                    <div className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center">
                      {expanded ? (
                        <div className="flex items-end gap-1 rounded border border-dashed border-[#C9CDD4] bg-white/90 px-2 pt-2 pb-1">
                          {side.map((p) => <Node key={p.id} n={{ id: p.id, label: p.name, sub: `PID ${p.pid}`, icon: P.term, shape: 'circle' }} />)}
                          <button onClick={() => setExpanded(false)} className="mb-8 cursor-pointer px-1 text-[12px] text-brand-6">收起</button>
                        </div>
                      ) : (
                        <button onClick={() => setExpanded(true)} className={`flex cursor-pointer flex-col items-center transition-opacity ${dimmed('more') ? 'opacity-25' : ''}`}>
                          <span className={`grid size-10 place-items-center rounded-full border-2 ${path?.has('more') ? '!border-brand-6 !text-brand-6' : ''} border-[#C9CDD4] bg-white font-mono text-[13px] text-text-4 hover:border-brand-6 hover:text-brand-6`}>+{side.length}</span>
                          <span className="mt-1 text-[12px] text-text-4">其他证据</span>
                        </button>
                      )}
                      <span className="h-5 border-l-2 border-dashed border-[#C9CDD4]" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- timeline ---------- */
function Timeline({ event, node, hover, onHover, onPick, statusOf, detailed }: { event: HuntEvent; node: string; hover: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void; statusOf: (id: string) => Status; detailed?: boolean }) {
  const compact = !detailed
  const pname = (id: string) => { const p = event.procs.find((x) => x.id === id)!; return `${p.name} · PID ${p.pid}` }
  return (
    <div className="px-6 pb-3">
      <ol className="border-t border-line">
        {event.timeline.map((t) => {
          const linked = t.proc === (hover ?? node)
          const dim = hover !== null && t.proc !== hover
          const st = ST[statusOf(t.proc)]
          return (
            <li key={t.id}>
              <button onClick={() => onPick(t.proc)} onMouseEnter={() => onHover(t.proc)} onMouseLeave={() => onHover(null)} className={`flex w-full cursor-pointer items-start gap-4 border-b border-line px-3 text-left transition-all duration-150 ${compact ? 'py-2' : 'py-3'} ${linked ? SEL : 'hover:bg-fill-2'} ${dim ? 'opacity-40' : ''}`}>
                <span className="w-16 shrink-0 pt-0.5 tabular-nums text-[12px] text-text-4">{t.time}</span>
                <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: st.c }} title={st.label} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><b className="font-medium">{t.title}</b><span className="text-[12px] text-text-3">{stageOf(t.stage).label} · {t.technique}</span></div>
                  <div className={`mt-1 font-mono text-[12px] text-text-4 ${compact ? 'truncate' : 'break-all'}`}>{t.detail}</div>
                  {detailed && <div className="mt-1 rounded bg-fill-2 px-2 py-1 font-mono text-[12px] break-all text-text-3">{event.procs.find((x) => x.id === t.proc)?.cmd}</div>}
                </div>
                <span className={`shrink-0 pt-0.5 font-mono text-[12px] ${linked ? 'text-brand-6' : 'text-text-3'}`}>{pname(t.proc)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ---------- process tree ---------- */
function ProcessTree({ processes, records, mainPath, node, hover, onHover, onPick, statusOf, onMenu, inPlan }: { processes: Proc[]; records: HuntEvent["timeline"]; mainPath: string[]; node: string; hover: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void; statusOf: (id: string) => Status; onMenu: (id: string, x: number, y: number) => void; inPlan: (id: string) => boolean }) {
  const lineage = new Set<string>()
  for (let c = processes.find((p) => p.id === hover); c; c = processes.find((p) => p.id === c!.parent)) lineage.add(c.id)
  const rows = forestRows(processes)
  return (
    <div className="px-6 py-4">
      <div className="mb-2 text-[12px] text-text-3">{processes.length} 个进程 · 主链进程加粗 · 悬停高亮进程血缘 · 右键打开节点操作</div>
      {rows.map(({ p, depth }) => {
        const s = statusOf(p.id)
        const active = node === p.id
        const n = records.filter((t) => t.proc === p.id).length
        return (
          <button key={p.id} onClick={() => onPick(p.id)} onContextMenu={(e) => { e.preventDefault(); onMenu(p.id, e.clientX, e.clientY) }} onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)} className={`flex w-full cursor-pointer items-center gap-2.5 rounded py-2 pr-3 text-left transition-all duration-150 ${active ? SEL : hover === p.id ? 'bg-fill-2' : 'hover:bg-fill-2'} ${lineage.size && !lineage.has(p.id) ? 'opacity-35' : ''}`} style={{ paddingLeft: 12 + depth * 22 }}>
            {depth > 0 && <span className="h-px w-3 shrink-0 bg-[#C9CDD4]" />}
            <span className="grid size-6 shrink-0 place-items-center rounded-full border-[1.5px]" style={{ borderColor: ST[s].c, color: ST[s].c }}><I d={P.term} size={11} /></span>
            <span className={`font-mono text-[13px] ${mainPath.includes(p.id) ? 'font-semibold' : ''} ${s === 'handled' ? 'text-text-3 line-through' : ''}`}>{p.name}</span>
            <span className="font-mono text-[12px] text-text-3">PID {p.pid}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-4">{p.cmd}</span>
            {inPlan(p.id) && <span className="shrink-0 rounded bg-brand-1 px-1.5 text-[12px] text-brand-6">已加入方案</span>}
            {n > 0 && <span className="shrink-0 rounded px-1.5 text-[12px]" style={{ color: ST[s].c, background: ST[s].bg }}>{n} 告警</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- right: node detail & evidence ---------- */
function NodePanel({ onMenu, event, host, node, hover, onHover, logs, statusOf, onPick, flash, onOpenPlan, pendingAlerts }: { onMenu: (id: string, x: number, y: number) => void; event: HuntEvent; host: Host; node: string; hover: string | null; onHover: (id: string | null) => void; logs: Log[]; statusOf: (id: string) => Status; onPick: (id: string) => void; flash: (t: string) => void; onOpenPlan: () => void; pendingAlerts: number }) {
  const [allAlerts, setAllAlerts] = useState(false)
  const p = event.procs.find((x) => x.id === node)
  const st = ST[statusOf(node)]
  const parent = p && event.procs.find((x) => x.id === p.parent)
  const evidence = event.timeline.filter((t) => t.proc === node)
  const meta: Record<string, { type: string; title: string; rows: [string, string][] }> = {
    src: { type: '攻击源', title: event.source.sub, rows: [['类型', event.source.label], ['关联 IOC', `${event.iocs.length} 个`]] },
    entry: { type: '入口', title: event.entry.label, rows: [['入口点', event.entry.sub], ['发生时间', event.timeline[0]?.time ?? '—'], ['技术', event.timeline[0]?.technique ?? '—']] },
    host: { type: '受害主机', title: host.name, rows: [['IP', host.ip], ['系统', host.os], ['分组', host.group], ['网络', host.isolated ? '已隔离' : '正常']] },
    art: { type: '落地文件', title: event.artifact.label, rows: [['路径', event.artifact.sub], ['来源进程', (() => { const l = event.procs.find((x) => x.id === event.mainPath[event.mainPath.length - 1])!; return `${l.name} · PID ${l.pid}` })()]] },
  }
  const Row = ({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) => (
    <div className="flex gap-3 py-1"><span className="w-16 shrink-0 text-text-3">{k}</span><span className={`min-w-0 flex-1 break-all ${mono ? 'font-mono text-[12px]' : ''}`}>{v}</span></div>
  )
  const alerts = allAlerts ? event.timeline : event.timeline.slice(0, 3)
  return (
    <aside className="flex min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scroll-thin">
        <SectionTitle extra={
          <div className="flex items-center gap-2">
            <span className="rounded px-1.5 text-[12px]" style={{ color: st.c, background: st.bg }}>{st.label}</span>
            <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu(node, r.right - 256, r.bottom + 4) }} className="flex h-6 cursor-pointer items-center gap-1 rounded border border-line px-2 text-[12px] text-text-4 hover:border-brand-6 hover:text-brand-6">
              节点操作<I d={P.down} size={12} />
            </button>
          </div>
        }>节点详情与证据</SectionTitle>
        <div className="border-b border-line pb-3">
          <div className="text-[12px] text-text-3">{p ? '进程' : meta[node]?.type}</div>
          <div className="mt-0.5 font-mono text-[14px] font-semibold break-all">{p ? p.name : meta[node]?.title}</div>
          <div className="mt-2 text-[13px]">
            {p ? (
              <>
                <Row k="PID" v={p.pid} mono />
                <Row k="父进程" v={parent ? `${parent.name} · ${parent.pid}` : '—'} mono />
                <Row k="用户" v={p.user} mono />
                <Row k="SHA256" v={p.sha256} mono />
                <Row k="签名" v={p.signer ?? <span className="text-red-6">无签名</span>} />
              </>
            ) : meta[node]?.rows.map(([a, b]) => <Row key={a} k={a} v={b} mono={/IP|路径|入口点/.test(a)} />)}
          </div>
          {p && (
            <div className="mt-2 rounded bg-fill-2 p-2 font-mono text-[12px] leading-5 break-all text-text-4">
              <div className="mb-0.5 flex justify-between text-[12px] text-text-3"><span>命令行</span><button className="flex cursor-pointer items-center gap-1 hover:text-brand-6" onClick={() => { navigator.clipboard?.writeText(p.cmd); flash('命令行已复制') }}><I d={P.copy} size={11} />复制</button></div>
              {p.cmd}
            </div>
          )}
        </div>

        {evidence.length > 0 && (
          <div className="mt-5">
            <SectionTitle>关键证据 <span className="ml-1 font-normal text-text-3">{evidence.length}</span></SectionTitle>
            {evidence.map((t) => (
              <div key={t.id} className="border-b border-line py-2 last:border-0">
                <div className="flex justify-between"><b className="font-medium">{t.title}</b><span className="tabular-nums text-[12px] text-text-3">{t.time}</span></div>
                <div className="mt-0.5 truncate font-mono text-[12px] text-text-4">{t.detail}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <SectionTitle extra={event.timeline.length > 3 && <Btn tone="link" onClick={() => setAllAlerts((v) => !v)}>{allAlerts ? '收起' : '查看全部'}</Btn>}>关联告警 <span className="ml-1 font-normal text-text-3">{event.timeline.length}</span></SectionTitle>
          <div className="flex flex-col gap-1.5">
            {alerts.map((t) => {
              const s = statusOf(t.proc)
              return (
                <button key={t.id} onClick={() => onPick(t.proc)} onMouseEnter={() => onHover(t.proc)} onMouseLeave={() => onHover(null)} className={`cursor-pointer rounded border-l-2 px-3 py-2 text-left transition-all ${t.proc === (hover ?? node) ? 'shadow-[0_0_0_1px_#165DFF]' : ''} ${hover && t.proc !== hover ? 'opacity-50' : ''}`} style={{ borderColor: ST[s].c, background: ST[s].bg }}>
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-0.5 text-[12px] text-text-4">{stageOf(t.stage).label} · {ST[s].label}</div>
                </button>
              )
            })}
            {!allAlerts && event.timeline.length > 3 && <span className="text-[12px] text-text-3">另 {event.timeline.length - 3} 条关联告警</span>}
          </div>
        </div>
      </div>
      <div className="border-t border-line px-5 pt-4">
        <SectionTitle extra={logs.length > 3 && <Btn tone="link" className="text-[12px]" onClick={onOpenPlan}>全部 {logs.length}</Btn>}>处置记录</SectionTitle>
        {logs.length === 0 ? <p className="text-[12px] text-text-3">尚未发起处置任务</p> : (
          <ol className="flex flex-col gap-2">
            {logs.slice(0, 3).map((l) => (
              <li key={l.id} className="flex gap-2 text-[12px]">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${l.state === 'done' ? 'bg-brand-6' : l.state === 'queued' ? 'bg-[#C9CDD4]' : 'animate-pulse bg-brand-6'}`} />
                <span className="min-w-0 flex-1 truncate"><b className="font-medium">{l.text}</b><span className="text-text-3"> · {l.target}</span></span>
                <span className={l.state === 'queued' ? 'text-text-3' : 'text-brand-6'}>{l.state === 'done' ? '已完成' : l.state === 'queued' ? '排队中' : '下发中'}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="px-5 py-4">
        <Btn tone="primary" className="h-10 w-full text-[14px]" onClick={onOpenPlan}>
          查看处置方案{pendingAlerts > 0 && <span className="grid size-5 place-items-center rounded-full bg-red-6 text-[12px]">{pendingAlerts}</span>}
        </Btn>
        <p className="mt-2 text-[12px] leading-5 text-text-3">封禁、终止、隔离等动作在处置方案中按需执行，调查区不常驻高风险操作。</p>
      </div>
    </aside>
  )
}

/* ---------- plan drawer ---------- */
type PlanKey = 'isolate' | 'killTree' | 'block' | 'quarantine' | 'persist'
function PlanDrawer({ event, host, node, statusOf, blocked, logs, onClose, onConfirm, actions, verdict, setVerdict, onFalsePositive, manual, onRemoveManual, pick: pickArr, setPick: savePick, persistence, cleaned }: {
  event: HuntEvent; host: Host; node: string; statusOf: (id: string) => Status; blocked: Set<string>; logs: Log[]
  verdict?: Verdict; setVerdict: (v: Verdict) => void; onFalsePositive: () => void
  manual: Manual[]; onRemoveManual: (ids: string[]) => void
  pick?: string[]; setPick: (p: string[]) => void; persistence: HuntEvent['timeline']; cleaned: boolean
  onClose: () => void; onConfirm: (c: { title: string; body: ReactNode; run: () => void }) => void
  actions: { isolate: () => void; killTree: (p: Proc) => void; kill: (p: Proc) => void; block: () => void; quarantine: () => void; hunt: (p: Proc) => void; persist: () => void; quarantineProc: (p: Proc) => void }
}) {
  const root = event.procs.find((p) => p.malicious) ?? event.procs[0]
  const queued = new Set(logs.filter((l) => l.state === 'queued').map((l) => l.text))
  const rootDone = event.procs.filter((x) => descendantsOf(event, root.id).includes(x.id)).every((x) => statusOf(x.id) !== 'pending' || persistence.some((t) => t.proc === x.id))
  const plan: { key: PlanKey; act: string; title: string; target: string; impact?: string; done: boolean }[] = [
    { key: 'isolate', act: '隔离主机', title: '隔离主机', target: `${host.name} · ${host.ip}`, impact: host.group.startsWith('生产') ? '生产资产，隔离将中断对外业务' : undefined, done: host.isolated },
    { key: 'killTree', act: '终止进程树', title: '终止恶意进程树', target: `${root.name} · PID ${root.pid}`, done: rootDone },
    ...(persistence.length ? [{ key: 'persist' as PlanKey, act: '清除持久化', title: '清除持久化', target: persistence.map((t) => t.detail).join('；'), impact: '仅终止进程无法阻止载荷被再次拉起', done: cleaned }] : []),
    { key: 'block', act: '封禁 IOC', title: '封禁 IOC', target: `${event.iocs.length} 个指标 · 全网下发`, done: event.iocs.every((i) => blocked.has(i.value)) },
    { key: 'quarantine', act: '隔离文件', title: '隔离落地文件', target: event.artifact.sub, done: statusOf('art') === 'handled' },
  ]
  const isOpen = (x: (typeof plan)[number]) => !x.done && !queued.has(x.act)
  // Selection is owned by App per event, so it survives closing and reopening the drawer.
  const pick = new Set<string>(pickArr ?? [...plan.filter(isOpen).map((x) => x.key), ...manual.map((m) => m.id)])
  const setPick = (f: (s: Set<string>) => Set<string>) => savePick([...f(pick)])
  const chosenManual = manual.filter((m) => pick.has(m.id))
  const chosenAi = plan.filter((x) => pick.has(x.key) && isOpen(x))
  const chosen = [...chosenAi.map((c) => ({ key: c.key, title: c.title, target: c.target, impact: c.impact })), ...chosenManual.map((m) => ({ key: m.id, title: m.title, target: m.target, impact: undefined as string | undefined }))]
  const procOf = (id: string) => event.procs.find((x) => x.id === id)!
  const toggle = (key: string) => setPick((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const run = () => onConfirm({
    title: `执行 ${chosen.length} 项处置`,
    body: <ul className="list-disc pl-4">{chosen.map((c) => <li key={c.key}>{c.title}：{c.target}{c.impact && <span className="text-[#D25F00]">（{c.impact}）</span>}</li>)}</ul>,
    run: () => {
      chosenAi.forEach((c) => (c.key === 'killTree' ? actions.killTree(root) : actions[c.key]()))
      chosenManual.forEach((m) => (m.kind === 'kill' ? actions.kill(procOf(m.node)) : m.kind === 'killTree' ? actions.killTree(procOf(m.node)) : actions.quarantineProc(procOf(m.node))))
      onRemoveManual(chosenManual.map((m) => m.id))
      savePick([])
    },
  })
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="flex h-full w-[440px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><h2 className="text-[16px] font-semibold">处置方案</h2><div className="text-[12px] text-text-3">{event.id} · {event.title}</div></div>
          <button onClick={onClose} className="cursor-pointer rounded p-1 text-text-3 hover:bg-fill-2"><I d={P.x} size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scroll-thin">
          <div className="flex gap-2.5">
            <img src="/assets/robot.png" alt="" className="size-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="h-5 text-[12px] text-text-4">AI 处置建议</div>
              <p className="mt-1 rounded-lg bg-[#f2f5fa] px-3 py-2.5 leading-[22px]">{event.ai}</p>
            </div>
          </div>

          {!host.online && (
            <div className="mt-3 flex items-center gap-2 rounded bg-fill-2 px-3 py-2 text-[12px] text-text-4"><I d={P.info} size={13} />{host.name} 当前离线，处置任务将排队，主机上线后自动执行。</div>
          )}

          <SectionTitle extra={!verdict && <span className="text-[12px] text-[#D25F00]">执行前需确认</span>}><span className="mt-5 block">研判结论</span></SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {([['attack', '确认为真实攻击', `与 AI 结论一致 · ${event.aiDetail.verdict}`], ['fp', '误报', '关闭事件，不执行处置']] as [Verdict, string, string][]).map(([v, t, d]) => (
              <label key={v} className={`cursor-pointer rounded border p-3 ${verdict === v ? 'border-brand-6 bg-brand-1' : 'border-line hover:border-[#bedaff]'}`}>
                <div className="flex items-center gap-2"><input type="radio" name="verdict" checked={verdict === v} onChange={() => setVerdict(v)} className="accent-[#165DFF]" /><b className="font-medium">{t}</b></div>
                <div className="mt-1 pl-5 text-[12px] text-text-3">{d}</div>
              </label>
            ))}
          </div>

          <div className={verdict === 'attack' ? '' : 'pointer-events-none opacity-45'}>
          <SectionTitle extra={<span className="text-[12px] text-text-3">已勾选 {chosen.length} 项</span>}><span className="mt-5 block">处置清单</span></SectionTitle>
          <div className="flex flex-col gap-2">
            {plan.map((x) => (
              <label key={x.key} className={`flex cursor-pointer items-start gap-3 rounded border p-3 ${!isOpen(x) ? 'cursor-default border-line bg-fill-2' : pick.has(x.key) ? 'border-brand-6 bg-brand-1/50' : 'border-line hover:border-[#bedaff]'}`}>
                <input type="checkbox" disabled={!isOpen(x)} checked={!isOpen(x) || pick.has(x.key)} onChange={() => toggle(x.key)} className="mt-0.5 accent-[#165DFF]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between"><b className="font-medium">{x.title}</b>{x.done ? <span className="text-[12px] text-brand-6">已完成</span> : queued.has(x.act) && <span className="text-[12px] text-text-3">已排队</span>}</div>
                  <div className="mt-0.5 truncate font-mono text-[12px] text-text-4">{x.target}</div>
                  {x.impact && isOpen(x) && <div className="mt-1 flex items-center gap-1 text-[12px] text-[#D25F00]"><I d={P.warn} size={12} />{x.impact}</div>}
                </div>
              </label>
            ))}
            {manual.map((m) => (
              <label key={m.id} className={`flex cursor-pointer items-start gap-3 rounded border border-dashed p-3 ${pick.has(m.id) ? 'border-brand-6 bg-brand-1/50' : 'border-line hover:border-[#bedaff]'}`}>
                <input type="checkbox" checked={pick.has(m.id)} onChange={() => toggle(m.id)} className="mt-0.5 accent-[#165DFF]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><b className="font-medium">{m.title}</b>
                    <button onClick={(e) => { e.preventDefault(); onRemoveManual([m.id]) }} title="移出清单" className="cursor-pointer text-text-3 hover:text-red-6"><I d={P.x} size={13} /></button>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[12px] text-text-4">{m.target}</div>
                  <div className="mt-1 text-[12px] text-text-3">手动添加 · 来自节点 <span className="font-mono">{procOf(m.node).name}</span></div>
                </div>
              </label>
            ))}
            <p className="text-[12px] text-text-3">需要针对其他节点处置？在攻击链或进程树中右键节点，或使用右栏「节点操作」加入清单。</p>
            {host.isolated && <Btn tone="link" className="self-start text-[12px]" onClick={() => onConfirm({ title: `解除隔离 ${host.name}？`, body: '主机将恢复正常网络访问。', run: actions.isolate })}>解除主机隔离</Btn>}
          </div>

          </div>

          <SectionTitle><span className="mt-5 block">处置记录</span></SectionTitle>
          {logs.length === 0 ? <p className="text-[12px] text-text-3">尚未发起处置任务</p> : (
            <ol className="flex flex-col gap-2.5">
              {logs.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${l.state === 'done' ? 'bg-brand-6' : l.state === 'queued' ? 'bg-[#C9CDD4]' : 'animate-pulse bg-brand-6'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between"><b className="font-medium">{l.text}</b><span className="tabular-nums text-[12px] text-text-3">{l.time}</span></div>
                    <div className="truncate text-[12px] text-text-3">{l.target} · {l.state === 'done' ? '执行成功' : l.state === 'queued' ? '排队中 · 主机上线后执行' : '下发中…'} · 冯国安</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Btn onClick={onClose}>关闭</Btn>
          {verdict === 'fp' ? <Btn tone="primary" onClick={onFalsePositive}>标记误报并关闭</Btn> : (
            <Btn tone="danger" disabled={verdict !== 'attack' || chosen.length === 0} onClick={run}>{host.online ? '执行所选' : '排队执行'}（{chosen.length}）</Btn>
          )}
        </div>
      </div>
    </div>
  )
}

const descendantsOf = (e: HuntEvent, id: string): string[] => [id, ...e.procs.filter((p) => p.parent === id).flatMap((c) => descendantsOf(e, c.id))]

/* ---------- AI insight — styled after the AI Kits "AI Message Chat Box" ---------- */
const CheckBadge = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="8" fill="#165DFF" /><path d="m4.8 8.2 2.1 2.1 4.3-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
function AiInsight({ event, verdict, onPick, onHover }: { event: HuntEvent; verdict?: Verdict; onPick: (id: string) => void; onHover: (id: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [thinking, setThinking] = useState(true)
  useEffect(() => { setOpen(false); setThinking(true) }, [event.id])
  const basis = event.timeline.filter((t) => event.procs.find((x) => x.id === t.proc)?.malicious)
  const d = event.aiDetail
  const confirmed = d.verdict === '确认入侵'
  const lastSeen = event.timeline[event.timeline.length - 1]?.time ?? event.time
  return (
    <div className="ai-insight scroll-thin border-b border-line bg-[#f7f9fc] px-6 py-3">
      <div className="flex gap-2.5">
        <img src="/assets/robot.png" alt="" className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex h-5 items-center gap-2 text-[12px] text-text-3">
            <span className="text-text-4">AI 研判</span><span className="tabular-nums">{lastSeen.slice(0, 5)}</span>
          </div>
          <div className="mt-1 rounded-lg bg-white px-4 pt-3 pb-2 shadow-[0_1px_4px_rgba(29,33,41,0.08)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 text-[12px] ${verdict === 'fp' ? 'bg-fill-2 text-text-3 line-through' : confirmed ? 'bg-[#FFF2F0] text-red-6' : 'bg-[#FFF7E8] text-[#D25F00]'}`}>{d.verdict}</span>
              <span className="rounded bg-fill-2 px-1.5 text-[12px] text-text-4">置信度 {event.score}%</span>
              {verdict && <span className="rounded bg-brand-1 px-1.5 text-[12px] text-brand-6">{verdict === 'fp' ? '人工判定：误报（已覆盖 AI 结论）' : '人工已确认'}</span>}
            </div>
            <p className={`mt-2 leading-[22px] text-text-5 ${open ? '' : 'line-clamp-2'}`}>{event.summary}</p>

            {open && (
              <div className="mt-3">
                {/* reasoning block */}
                <div className="rounded-lg bg-[#f2f5fa] px-3 py-2.5">
                  <button onClick={() => setThinking((v) => !v)} className="flex w-full cursor-pointer items-center gap-1.5 text-left">
                    <CheckBadge /><span className="text-brand-6">研判推理完成</span><span className="text-[12px] text-text-3">· 基于 {event.timeline.length} 条告警</span>
                    <I d={P.up} size={14} className={`ml-auto text-text-4 transition-transform ${thinking ? '' : 'rotate-180'}`} />
                  </button>
                  {thinking && (
                    <ol className="mt-2 ml-1.5 border-l border-[#d9dde4] pl-3.5 text-[13px] leading-[22px] text-text-4">
                      {event.timeline.map((t) => (
                        <li key={t.id}><span className="tabular-nums">{t.time}</span> {t.title}：{t.detail}，符合 {t.technique}。</li>
                      ))}
                      <li className="mt-1">综合以上行为链，判定为「{d.verdict}」，置信度 {event.score}%。</li>
                    </ol>
                  )}
                </div>

                <div className="mt-3 space-y-3 leading-[22px]">
                  <section><h4 className="font-semibold">攻击意图</h4><p className="text-text-5">{d.intent}</p></section>
                  <section><h4 className="font-semibold">影响评估</h4><p className="text-text-5">{d.impact}</p></section>
                  <section>
                    <h4 className="font-semibold">研判依据</h4>
                    <ul className="list-disc pl-5">
                      {basis.map((t) => (
                        <li key={t.id}>
                          <button onClick={() => onPick(t.proc)} onMouseEnter={() => onHover(t.proc)} onMouseLeave={() => onHover(null)} className="cursor-pointer text-left hover:text-brand-6">
                            <b className="font-semibold">{t.title}：</b><span className="text-text-4">{t.technique} · {t.time}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-semibold">建议继续调查</h4>
                    <ul className="list-disc pl-5 text-text-5">{d.next.map((n) => <li key={n}>{n}</li>)}</ul>
                  </section>
                  <p className="text-[12px] text-text-3">处置建议：{event.ai} 可在「处置方案」中执行。</p>
                </div>
              </div>
            )}

            <div className="mt-2">
              <button aria-expanded={open} onClick={() => setOpen((v) => !v)} className="-ml-1.5 flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-brand-6 hover:bg-brand-1">
                {open ? '收起' : '更多研判'}<I d={P.down} size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

