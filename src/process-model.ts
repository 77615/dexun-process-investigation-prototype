import { HOSTS, type Proc } from './data'

export type ProcessInstance = Proc & { hostId: string; startedAt: string; exitedAt?: string; sourceEvent?: string; sourceProc?: string }
export type ProcessRecord = { id: string; processId: string; time: string; title: string; detail: string; kind: 'event' | 'behavior'; eventId?: string; eventTitle?: string; sourceProc?: string }
export const capturedAt = new Date().setHours(12, 0, 0, 0)
const stamp = (hours: number) => new Date(capturedAt - hours * 3600000).toISOString()
// These two demo incidents explicitly reference the same captured process instances.
export const processKey = (host: string, event: string, proc: string) => `${host}/${event === 'INC-3202' ? 'INC-3201' : event}/${proc}`
export function ancestors<T extends { id: string; parent?: string }>(items: T[], id: string): T[] {
  const seen = new Set([id]); const result: T[] = []
  let p = items.find(x => x.id === id)
  while (p?.parent && !seen.has(p.parent)) { seen.add(p.parent); p = items.find(x => x.id === p!.parent); if (p) result.unshift(p) }
  return result
}
export function descendants<T extends { id: string; parent?: string }>(items: T[], id: string): Set<string> {
  const result = new Set<string>(); const todo = [id]
  while (todo.length) { const next = todo.pop()!; if (result.has(next)) continue; result.add(next); todo.push(...items.filter(x => x.parent === next).map(x => x.id)) }
  return result
}
export function forestRows<T extends { id: string; parent?: string }>(items: T[]) {
  const seen = new Set<string>(); const rows: { p: T; depth: number }[] = []
  const walk = (p: T, depth: number) => { if (seen.has(p.id)) return; seen.add(p.id); rows.push({ p, depth }); items.filter(x => x.parent === p.id).forEach(x => walk(x, depth + 1)) }
  items.filter(x => !items.some(p => p.id === x.parent)).forEach(x => walk(x, 0))
  items.filter(x => !seen.has(x.id)).forEach(x => walk(x, 0))
  return rows
}
// Explicit demonstration capture: event-linked instances plus independent background trees.
export const hostCaptures = Object.fromEntries(HOSTS.map(host => {
  const linkedProcesses: ProcessInstance[] = host.events.flatMap(event => event.procs.map(p => ({ ...p,
    id: processKey(host.id, event.id, p.id), parent: p.parent ? processKey(host.id, event.id, p.parent) : undefined,
    hostId: host.id, startedAt: stamp(4), sourceEvent: event.id, sourceProc: p.id,
    exitedAt: p.name === 'curl' ? stamp(2) : undefined,
  })))
  const processes = [...new Map(linkedProcesses.map(p => [p.id, p])).values()]
  const windows = host.os.includes('Windows')
  const extra = (id: string, name: string, pid: number, parent?: string, startedAt = stamp(96), exitedAt?: string): ProcessInstance => ({ id: `${host.id}/${id}`, hostId: host.id, name, pid, parent: parent ? `${host.id}/${parent}` : undefined, startedAt, exitedAt, cmd: windows ? `C:\\Windows\\System32\\${name}` : `/usr/sbin/${name}`, user: windows ? 'SYSTEM' : 'root', sha256: 'demo-7ab9…81c2' })
  processes.push(extra('system', windows ? 'services.exe' : 'systemd', 1), extra('agent', windows ? 'agent.exe' : 'security-agent', 720, 'system'), extra('normal', windows ? 'svchost.exe' : 'cron', 850, 'system'), extra('old', windows ? 'cmd.exe' : 'bash', 4412, 'system', stamp(60), stamp(50)), extra('orphan', windows ? 'worker.exe' : 'worker', 9120, 'not-captured', stamp(3)))
  const records: ProcessRecord[] = host.events.flatMap(event => event.timeline.flatMap((t, i) => {
    const base = { processId: processKey(host.id, event.id, t.proc), time: stamp(3 - i * .05), title: t.title, detail: t.detail, eventId: event.id, eventTitle: event.title, sourceProc: t.proc }
    return [{ ...base, id: `${event.id}/${t.id}`, kind: 'event' as const }, { ...base, id: `${event.id}/${t.id}/raw`, kind: 'behavior' as const }]
  }))
  records.push({ id: `${host.id}/heartbeat`, processId: `${host.id}/agent`, time: stamp(1), title: '网络连接', detail: '连接管理服务 10.10.0.10:443', kind: 'behavior' })
  return [host.id, { processes, records }]
})) as Record<string, { processes: ProcessInstance[]; records: ProcessRecord[] }>
export function inRange(p: ProcessInstance, from: number, to: number) { return Date.parse(p.startedAt) <= to && (!p.exitedAt || Date.parse(p.exitedAt) >= from) }
