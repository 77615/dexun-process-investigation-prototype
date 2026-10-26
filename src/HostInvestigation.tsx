import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { HOSTS, STAGES, type Severity } from './data'
import { ancestors, descendants, forestRows, hostCaptures, capturedAt, inRange, type ProcessInstance } from './process-model'
import './host-investigation.css'
import './host-detail.css'

// Visual layer follows the existing 主机详情 Figma page (Arco-style): gray-fill inputs, 2px radius,
// #F2F3F5 table headers, blue-bar section titles. Native elements are used so the styles match 1:1.
export const navigate = (url: string) => { history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')) }
const fmt = (date?: string) => date ? new Date(date).toLocaleString('zh-CN', { hour12: false }) : '—'
const clock = (date: string) => new Date(date).toLocaleTimeString('zh-CN', { hour12: false })
const SEVERITY: Record<Severity, { label: string; tone: string }> = { critical: { label: '严重', tone: 'red' }, high: { label: '高危', tone: 'orange' }, medium: { label: '中危', tone: 'gold' }, low: { label: '低危', tone: 'gray' } }
const HOST_TABS = ['基本信息', '资源监控', '远程安全', '安全告警', '漏洞管理', '基线管理', '进程调查']
const RANGES = [['1', '近 1 小时'], ['24', '近 24 小时'], ['72', '近 3 天'], ['168', '近 7 天']]
const risk = (p: ProcessInstance) => p.malicious ? 'malicious' : p.suspicious ? 'suspicious' : 'normal'
const riskLabel = { malicious: '恶意', suspicious: '可疑', normal: '正常' } as const
const riskTone = { malicious: 'red', suspicious: 'orange', normal: 'gray' } as const

const Tag = ({ tone = 'gray', children }: { tone?: string; children: ReactNode }) => <span className={`hd-tag ${tone}`}>{children}</span>
const Btn = ({ kind = 'secondary', children, ...rest }: { kind?: 'primary' | 'secondary' | 'danger' } & ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" className={`hd-btn ${kind}`} {...rest}>{children}</button>
const Title = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => <header className="hd-title"><h3>{children}</h3>{extra && <span className="hd-title-extra">{extra}</span>}</header>

export default function HostInvestigation({ hostId, initial, active }: { hostId: string; initial: string; active: boolean }) {
  const host = HOSTS.find(h => h.id === hostId)!
  const { processes, records } = hostCaptures[hostId]
  const params = new URLSearchParams(initial)
  const parsedFrom = Number(params.get('from')); const parsedTo = Number(params.get('to'))
  const validRange = Number.isFinite(parsedFrom) && Number.isFinite(parsedTo) && parsedFrom > 0 && parsedTo > parsedFrom && parsedTo < 8640000000000000
  const firstAlerted = processes.find(p => p.malicious && records.some(r => r.kind === 'event' && r.processId === p.id))
  const [selected, setSelected] = useState(params.get('process') || firstAlerted?.id || processes[0]?.id || '')
  const [from, setFrom] = useState(validRange ? parsedFrom : capturedAt - 86400000)
  const [to, setTo] = useState(validRange ? parsedTo : capturedAt)
  const [query, setQuery] = useState('')
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const [includeChildren, setIncludeChildren] = useState(true)
  const [detailTab, setDetailTab] = useState('event')
  const [rail, setRail] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [camera, setCamera] = useState({ x: 32, y: 32, zoom: 1 })
  const graphRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    const incoming = new URLSearchParams(initial); const id = incoming.get('process')
    if (id && id !== selected) { setSelected(id); setQuery(''); setOnlyAlerts(false) }
    const a = Number(incoming.get('from')); const b = Number(incoming.get('to'))
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > a && b < 8640000000000000) { setFrom(a); setTo(b) }
  }, [initial])

  const selectedProcess = processes.find(p => p.id === selected)
  const periodProcesses = processes.filter(p => inRange(p, from, to))
  const periodRecords = records.filter(r => Date.parse(r.time) >= from && Date.parse(r.time) <= to)
  const alertCount = (id: string) => periodRecords.filter(r => r.kind === 'event' && r.processId === id).length
  const matches = periodProcesses.filter(p => (!onlyAlerts || alertCount(p.id) > 0) && `${p.name} ${p.pid} ${p.cmd}`.toLowerCase().includes(query.toLowerCase()))
  const allowed = new Set(matches.flatMap(p => [p.id, ...ancestors(processes, p.id).map(x => x.id)]))
  const treeRows = forestRows(processes.filter(p => allowed.has(p.id))).filter(({ p }) => ancestors(processes, p.id).every(a => !collapsed.has(a.id) || !allowed.has(a.id)))
  const lineage = selectedProcess ? [...ancestors(processes, selected), selectedProcess] : []
  const parentMissing = !!selectedProcess?.parent && !processes.some(p => p.id === selectedProcess.parent)
  const subtree = descendants(processes, selected)
  const children = processes.filter(p => p.parent === selected)

  // Only the selected process's lineage + subtree is drawn; a host-wide graph is too heavy to render.
  const graphItems = processes.filter(p => lineage.some(l => l.id === p.id) || subtree.has(p.id))
  const graphRows = forestRows(graphItems)
  const positions = new Map<string, number>(); let nextRow = 0
  const place = (id: string): number => { if (positions.has(id)) return positions.get(id)!; positions.set(id, nextRow); const kids = graphRows.filter(r => r.p.parent === id); const ys = kids.map(r => place(r.p.id)); const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : nextRow++; positions.set(id, y); return y }
  graphRows.filter(r => !graphRows.some(a => a.p.id === r.p.parent)).forEach(r => { place(r.p.id); nextRow += .4 })
  const nodes = graphRows.map(row => ({ ...row, x: 24 + row.depth * 220, y: 20 + (positions.get(row.p.id) || 0) * 72 }))
  const onPath = new Set(lineage.map(p => p.id))

  const scope = includeChildren ? subtree : new Set([selected])
  const scopedRecords = periodRecords.filter(r => scope.has(r.processId))
  const eventHits = scopedRecords.filter(r => r.kind === 'event').sort((a, b) => a.time.localeCompare(b.time))
  const eventCount = new Set(eventHits.map(r => r.eventId)).size
  const behaviors = scopedRecords.filter(r => r.kind === 'behavior').sort((a, b) => a.time.localeCompare(b.time))
  const outOfRange = selectedProcess && !periodProcesses.some(p => p.id === selected)
  const directEvents = new Set(periodRecords.filter(r => r.kind === 'event' && r.processId === selected).map(r => r.eventId)).size
  const firstEvent = eventHits[0]

  useEffect(() => { if (!active) return; const p = new URLSearchParams(location.search); p.set('process', selected); p.set('from', String(from)); p.set('to', String(to)); history.replaceState(history.state, '', `${location.pathname}?${p}`) }, [active, selected, from, to])
  const pick = (id: string) => { setSelected(id); setCollapsed(prev => { const next = new Set(prev); ancestors(processes, id).forEach(a => next.delete(a.id)); return next }) }
  const fit = () => { const r = graphRef.current?.getBoundingClientRect(); if (!r || !nodes.length) return; const w = Math.max(...nodes.map(n => n.x)) + 210; const h = Math.max(...nodes.map(n => n.y)) + 76; const zoom = Math.min(1, r.width / w, r.height / h); setCamera({ x: (r.width - w * zoom) / 2, y: (r.height - h * zoom) / 2, zoom }) }
  useEffect(() => { if (!active) return; const id = requestAnimationFrame(fit); return () => cancelAnimationFrame(id) }, [active, selected, from, to, rail])
  const openEvent = (eventId: string, proc?: string) => navigate(`/?host=${hostId}&event=${encodeURIComponent(eventId)}&node=${encodeURIComponent(proc || '')}`)
  const toggle = (id: string) => setCollapsed(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const procChip = (id: string) => { const p = processes.find(x => x.id === id)!; return id === selected ? <span className="hd-muted">当前进程</span> : <button type="button" className="hd-link" onClick={() => pick(id)}>{p.name}（{p.pid}）</button> }
  const rangeHours = String((to - from) / 3600000)

  return <div className="hd-page">
    <nav className="hd-topbar"><span>工作区</span><i>›</i><span>资产管理</span><i>›</i><b>主机详情</b></nav>

    <section className="hd-header">
      <div className="hd-back-row"><button type="button" className="hd-back" onClick={() => navigate('/')}><span className="hd-back-icon">‹</span>返回调查队列</button><span className="hd-muted">由威胁狩猎 · 调查队列进入</span></div>
      <div className="hd-host">
        <span className="hd-host-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M7 7.5h2M7 16.5h2"/></svg></span>
        <div className="hd-host-main">
          <h2>{host.name}</h2>
          <div className="hd-btn-group"><Btn kind="danger">⊘ 隔离该主机</Btn><Btn>更多 ⌄</Btn></div>
          <dl className="hd-meta">{[['主机名称', host.name], ['操作系统', host.os], ['主机状态', ''], ['Agent 版本', '1.2.0'], ['主机 IP', host.ip]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{k === '主机状态' ? <Tag tone={host.online ? 'green' : 'gray'}>● {host.online ? '在线' : '离线'}</Tag> : v}</dd></div>)}</dl>
        </div>
      </div>
    </section>

    <section className="hd-body">
      <div className="hd-card hd-tabs-card">
        <div className="hd-tabs" role="tablist">
          {HOST_TABS.map(t => <button key={t} type="button" role="tab" aria-selected={t === '进程调查'} className={`hd-tab ${t === '进程调查' ? 'active' : ''}`}>{t}{t === '进程调查' && <sup className="hd-new">新</sup>}</button>)}
          <span className="hd-toolbar-spacer"/>
          <button type="button" className="hd-tabs-rail" onClick={() => setRail(v => !v)}>{rail ? '收起侧栏 ›' : '‹ 展开侧栏'}</button>
        </div>

        <div className="hd-toolbar">
          <label className="hd-select"><select value={rangeHours} onChange={e => { setFrom(capturedAt - Number(e.target.value) * 3600000); setTo(capturedAt) }}>{!RANGES.some(([v]) => v === rangeHours) && <option value={rangeHours}>自定义范围</option>}{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="hd-input"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入进程名 / PID / 命令行搜索"/><span aria-hidden="true">⌕</span></label>
          <label className="hd-check"><input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)}/>仅看触发告警的进程</label>
          <span className="hd-toolbar-spacer"/>
          <span className="hd-muted">{fmt(new Date(from).toISOString())} — {fmt(new Date(to).toISOString())}</span>
        </div>

        <div className="hd-split">
          <aside className="hd-tree" aria-label="主机进程树">
            <div className="hd-tree-head"><span>进程树</span><span className="hd-muted">{matches.length} / {periodProcesses.length}</span></div>
            <div className="hd-tree-scroll" role="tree">
              {treeRows.map(({ p, depth }) => { const count = alertCount(p.id); const hasKids = processes.some(c => c.parent === p.id && allowed.has(c.id))
                return <div key={p.id} role="treeitem" aria-selected={p.id === selected} className={`hd-tree-row ${p.id === selected ? 'selected' : ''} ${onPath.has(p.id) && p.id !== selected ? 'on-path' : ''} ${matches.some(m => m.id === p.id) ? '' : 'dim'}`} style={{ '--depth': depth } as CSSProperties}>
                  <button type="button" className="hd-tree-toggle" disabled={!hasKids} aria-label={collapsed.has(p.id) ? '展开' : '收起'} onClick={() => toggle(p.id)}>{hasKids ? (collapsed.has(p.id) ? '▸' : '▾') : ''}</button>
                  <button type="button" className="hd-tree-label" onClick={() => pick(p.id)}>
                    <i className={`hd-dot ${risk(p)}`}/><span className="hd-tree-name">{p.name}</span><span className="hd-tree-pid">{p.pid}</span>
                    {p.exitedAt && <span className="hd-tree-flag">已退出</span>}
                    {p.parent && !processes.some(x => x.id === p.parent) && <span className="hd-tree-flag">父进程缺失</span>}
                    {count > 0 && <span className="hd-alert-count" title={`${count} 条告警`}><i aria-hidden="true">▲</i>{count}</span>}
                  </button>
                </div> })}
              {!treeRows.length && <p className="hd-empty">没有匹配的进程，请调整筛选条件</p>}
            </div>
            <div className="hd-legend">{(['malicious', 'suspicious', 'normal'] as const).map(k => <span key={k}><i className={`hd-dot ${k}`}/>{riskLabel[k]}</span>)}<span><span className="hd-alert-count"><i aria-hidden="true">▲</i>n</span>告警数</span></div>
          </aside>

          <main className="hd-main">
            {!selectedProcess ? <p className="hd-empty">未找到指定进程，请在左侧进程树中选择</p> : <>
              {outOfRange && <div className="hd-alert">选中进程不在当前时间范围内，进程树中不显示。<button type="button" className="hd-link" onClick={() => { setFrom(Date.parse(selectedProcess.startedAt) - 3600000); setTo(selectedProcess.exitedAt ? Date.parse(selectedProcess.exitedAt) + 3600000 : capturedAt) }}>调整到进程存活时间</button></div>}

              <section className="hd-section">
                <div className="hd-proc-head">
                  <div className="hd-proc-title"><h3>{selectedProcess.name}</h3><span className="hd-muted">PID {selectedProcess.pid}</span><Tag tone={riskTone[risk(selectedProcess)]}>{riskLabel[risk(selectedProcess)]}</Tag><Tag tone={selectedProcess.exitedAt ? 'gray' : 'green'}>{selectedProcess.exitedAt ? '已退出' : '运行中'}</Tag></div>
                  <div className="hd-btn-group">{firstEvent && <Btn kind="primary" onClick={() => openEvent(firstEvent.eventId!, firstEvent.sourceProc)}>在事件调查中打开</Btn>}<Btn onClick={() => navigator.clipboard?.writeText(selectedProcess.cmd)}>复制命令行</Btn></div>
                </div>
                <code className="hd-cmd">{selectedProcess.cmd}</code>
                <dl className="hd-meta compact">{[['直接关联事件', directEvents], ['子树告警命中', eventHits.length], ['父进程', parentMissing ? '未采集' : lineage.at(-2) ? <button type="button" className="hd-link" onClick={() => pick(lineage.at(-2)!.id)}>{lineage.at(-2)!.name}（{lineage.at(-2)!.pid}）</button> : '无'], ['运行用户', selectedProcess.user], ['启动时间', fmt(selectedProcess.startedAt)]].map(([k, v]) => <div key={k as string}><dt>{k}</dt><dd className={k === '直接关联事件' && v ? 'hd-red' : ''}>{v}</dd></div>)}</dl>
              </section>


              <section className="hd-section">
                <Title extra="仅展示当前进程的祖先链与全部子进程">进程树视图</Title>
                <div className="hd-graph">
                  <div className="hd-graph-tools"><button type="button" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(.2, c.zoom - .15) }))}>−</button><span>{Math.round(camera.zoom * 100)}%</span><button type="button" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(2, c.zoom + .15) }))}>+</button><button type="button" onClick={fit}>适应画布</button></div>
                  <svg ref={graphRef} className="hd-canvas" aria-label="进程树" onPointerDown={e => { if ((e.target as Element).closest('[role="button"]')) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: camera.x, oy: camera.y } }} onPointerMove={e => { const o = drag.current; if (o) setCamera(c => ({ ...c, x: o.ox + e.clientX - o.x, y: o.oy + e.clientY - o.y })) }} onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }} onPointerCancel={() => { drag.current = null }}>
                    <g transform={`translate(${camera.x},${camera.y}) scale(${camera.zoom})`}>
                      {nodes.map(n => { const parent = nodes.find(x => x.p.id === n.p.parent); return parent && <path key={`e-${n.p.id}`} className={`hd-edge ${onPath.has(n.p.id) ? 'path' : ''} ${subtree.has(n.p.id) && n.p.id !== selected ? 'sub' : ''}`} d={`M${parent.x + 176},${parent.y + 26} H${parent.x + 198} V${n.y + 26} H${n.x}`}/> })}
                      {nodes.map(({ p, x, y }) => { const count = alertCount(p.id); return <g key={p.id} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`${p.name} PID ${p.pid}`} aria-pressed={selected === p.id} onClick={() => pick(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p.id) } }} className={`hd-node ${risk(p)} ${selected === p.id ? 'selected' : ''} ${onPath.has(p.id) ? 'path' : ''}`}>
                        <rect className="hd-node-box" width={176} height={52} rx={2}/><rect className="hd-node-bar" width={3} height={52}/>
                        <text className="hd-node-name" x={14} y={22}>{p.name}</text><text className="hd-node-sub" x={14} y={40}>PID {p.pid} · {p.exitedAt ? '已退出' : '运行中'}</text>
                        {count > 0 && <text x={166} y={22} textAnchor="end" className="hd-node-count">▲ {count}</text>}
                        <title>{p.cmd}</title>
                      </g> })}
                    </g>
                  </svg>
                </div>
              </section>

              <section className="hd-section">
                <div className="hd-subtabs">
                  {[['event', `关联安全事件（${eventCount}）`], ['behavior', `行为时间线（${behaviors.length}）`], ['attr', '进程属性']].map(([v, l]) => <button key={v} type="button" className={detailTab === v ? 'active' : ''} onClick={() => setDetailTab(v)}>{l}</button>)}
                  <span className="hd-toolbar-spacer"/>
                  {detailTab !== 'attr' && <label className="hd-check"><input type="checkbox" checked={includeChildren} onChange={e => setIncludeChildren(e.target.checked)}/>包含后代进程（{subtree.size - 1}）</label>}
                </div>
                {detailTab === 'event' && <table className="hd-table">
                  <thead><tr><th style={{ width: '9%' }}>时间</th><th style={{ width: '9%' }}>阶段</th><th>行为</th><th style={{ width: '16%' }}>ATT&CK 技术</th><th style={{ width: '13%' }}>触发进程</th><th style={{ width: '22%' }}>所属事件</th><th style={{ width: '9%' }}>操作</th></tr></thead>
                  <tbody>{eventHits.map(r => { const event = host.events.find(e => e.id === r.eventId)!; const t = event.timeline.find(t => `${event.id}/${t.id}` === r.id); const stage = STAGES.find(s => s.key === t?.stage)
                    return <tr key={r.id}>
                      <td className="hd-mono">{clock(r.time)}</td>
                      <td>{stage && <span className="hd-stage" style={{ '--stage': stage.color } as CSSProperties}>{stage.label}</span>}</td>
                      <td><div>{r.title}</div><div className="hd-muted hd-ellipsis">{r.detail}</div></td>
                      <td className="hd-muted">{t?.technique}</td>
                      <td>{procChip(r.processId)}</td>
                      <td><Tag tone={SEVERITY[event.severity].tone}>{SEVERITY[event.severity].label}</Tag> {event.title}<div className="hd-muted">{event.id} · {event.status}</div></td>
                      <td><button type="button" className="hd-link" onClick={() => openEvent(event.id, r.sourceProc)}>查看事件</button></td>
                    </tr> })}
                    {!eventHits.length && <tr><td colSpan={7} className="hd-empty">当前范围内该进程{includeChildren ? '及其后代' : ''}未触发安全事件</td></tr>}
                  </tbody>
                </table>}
                {detailTab === 'behavior' && <table className="hd-table">
                  <thead><tr><th style={{ width: '9%' }}>时间</th><th style={{ width: '14%' }}>行为类型</th><th>详情</th><th style={{ width: '15%' }}>进程</th><th style={{ width: '22%' }}>命中事件</th></tr></thead>
                  <tbody>{behaviors.map(r => <tr key={r.id}><td className="hd-mono">{clock(r.time)}</td><td>{r.title}</td><td className="hd-muted">{r.detail}</td><td>{procChip(r.processId)}</td><td>{r.eventTitle ? <Tag tone="red">{r.eventTitle}</Tag> : <span className="hd-muted">—</span>}</td></tr>)}
                    {!behaviors.length && <tr><td colSpan={5} className="hd-empty">该范围内没有行为记录</td></tr>}
                  </tbody>
                </table>}
                {detailTab === 'attr' && <dl className="hd-desc">{[['进程名', selectedProcess.name], ['PID', selectedProcess.pid], ['父进程', parentMissing ? '未采集' : lineage.at(-2) ? `${lineage.at(-2)!.name}（${lineage.at(-2)!.pid}）` : '无'], ['运行用户', selectedProcess.user], ['启动时间', fmt(selectedProcess.startedAt)], ['退出时间', fmt(selectedProcess.exitedAt)], ['签名', selectedProcess.signer || '无签名'], ['SHA256', selectedProcess.sha256], ['实例 ID', selectedProcess.id]].map(([k, v]) => <div key={k as string}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
              </section>
              <p className="hd-note">进程调查为只读视图：终止进程、隔离主机等响应处置仍在事件调查工作台完成。</p>
            </>}
          </main>
        </div>
      </div>

      {rail && <aside className="hd-rail">
        <section className="hd-card hd-rail-card"><Title>风险概览</Title>
          <div className="hd-risk-grid">{([['致命', 'critical', 'red'], ['高危', 'high', 'orange'], ['中危', 'medium', 'gold'], ['低危', 'low', 'green']] as const).map(([l, k, tone]) => <div key={k}><span>{l}</span><b><i className={`hd-risk-icon ${tone}`}>!</i>{String(host.events.filter(e => e.severity === k).length).padStart(2, '0')}</b></div>)}</div>
        </section>
        <section className="hd-card hd-rail-card"><Title extra={<button type="button" className="hd-link">✎ 修改标签</button>}>资产标签</Title><div className="hd-tags">{host.group.split(' / ').map(t => <span key={t} className="hd-asset-tag">{t}</span>)}<button type="button" className="hd-link">+ 新标签</button></div></section>
        <section className="hd-card hd-rail-card"><Title>最近发现</Title>
          <ul className="hd-feed">{records.filter(r => r.kind === 'event').slice(0, 5).map(r => <li key={r.id}><span className="hd-muted">{clock(r.time).slice(0, 5)}</span>{r.title}</li>)}</ul>
        </section>
      </aside>}
    </section>
  </div>
}
