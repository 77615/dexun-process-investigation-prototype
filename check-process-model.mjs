import ts from 'typescript'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const folder = await mkdtemp(join(tmpdir(), 'hunting-model-'))
for (const name of ['data', 'process-model']) {
  const source = await readFile(new URL(`./src/${name}.ts`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace("'./data'", "'./data.mjs'")
  await writeFile(join(folder, `${name}.mjs`), js)
}
const { hostCaptures, ancestors, descendants, forestRows, processKey, inRange, capturedAt } = await import(pathToFileURL(join(folder, 'process-model.mjs')))
const { processes, records } = hostCaptures.h1
const bash = processKey('h1', 'INC-3201', 'p3')
assert.deepEqual(ancestors(processes, bash).map(p => p.name), ['nginx', 'php-fpm'])
assert.equal(descendants(processes, bash).size, 4)
assert.equal(processes.filter(p => p.pid === 4412).length, 2)
assert.equal(new Set(processes.map(p => p.id)).size, processes.length)
assert.equal(new Set(records.filter(r => r.processId === processKey('h1', 'INC-3201', 'p5') && r.kind === 'event').map(r => r.eventId)).size, 2)
assert.equal(records.filter(r => r.processId === 'h1/agent' && r.kind === 'event').length, 0)
assert.ok(records.some(r => r.processId === 'h1/agent' && r.kind === 'behavior'))
assert.equal(inRange(processes.find(p => p.id === 'h1/old'), capturedAt - 86400000, capturedAt), false)
assert.equal(inRange(processes.find(p => p.id === 'h1/system'), capturedAt - 86400000, capturedAt), true)
assert.ok(forestRows(processes).some(r => r.p.id === 'h1/orphan' && r.depth === 0))
assert.equal(forestRows([{id:'a',parent:'b'},{id:'b',parent:'a'}]).length, 2)
assert.equal(descendants([{id:'a',parent:'b'},{id:'b',parent:'a'}], 'a').size, 2)
console.log('12 process model assertions passed')
