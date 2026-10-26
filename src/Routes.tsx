import { useEffect, useState } from 'react'
import App from './App'
import HostInvestigation from './HostInvestigation'
import { HOSTS } from './data'
export default function Routes() {
  const [url, setUrl] = useState(location.pathname + location.search)
  const hostId = /^\/hosts\/([^/]+)\/process-investigation$/.exec(url.split('?')[0])?.[1]
  const [visited, setVisited] = useState<Record<string, string>>(() => hostId ? { [hostId]: location.search } : {})
  useEffect(() => { const update = () => { setUrl(location.pathname + location.search); const id = /^\/hosts\/([^/]+)\/process-investigation$/.exec(location.pathname)?.[1]; if (id) setVisited(v => v[id] === location.search ? v : { ...v, [id]: location.search }) }; window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update) }, [])
  return <>
    <section className="route-page" hidden={!!hostId}><App route={url}/></section>
    {Object.entries(visited).filter(([id]) => HOSTS.some(h => h.id === id)).map(([id, initial]) => <section className="route-page" key={id} hidden={id !== hostId}><HostInvestigation hostId={id} initial={initial} active={id === hostId}/></section>)}
    {hostId && !HOSTS.some(h => h.id === hostId) && <section>未找到该主机。<a href="/">返回事件工作台</a></section>}
  </>
}
