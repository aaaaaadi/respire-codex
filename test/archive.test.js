import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { memoryTools, archiveTurn } from '../lib/archive.js'
import { connectCodex } from '../lib/codex.js'
import { handleHook } from '../lib/hook.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const id = '12345678-1234-1234-1234-123456789012'
const next = '87654321-4321-4321-4321-210987654321'
const read = command => ({ command, args: command === 'show' ? [id] : command === 'recall' ? ['project', '--titles', '--json'] : [] })
const update = { command: 'update', args: [id, '--title', '项目验收已通过', '--content', '【前因】验收。【行为】核对。【后果】通过。'] }
async function prime(memory) {
  for (const command of ['recall', 'prompt', 'show']) await memory.run(read(command))
}

test('archive tools require policy, candidates, real write receipts and readback', async () => {
  const calls = []
  let wrongShow = true
  const memory = memoryTools(async args => { calls.push(args); return { status: 'ok', summary: { id: args[0] === 'remember' || (args[0] === 'show' && args[1] === next && !wrongShow) ? next : id } } })
  await assert.rejects(memory.run(update), /read-before-write/)
  await prime(memory)
  assert.ok(calls.every(args => !args.includes('--json')))
  await memory.run(update)
  assert.throws(() => memory.finish(JSON.stringify({ result: 'stored', ids: [id] })), /archive-unverified/)
  await memory.run(read('show'))
  await assert.rejects(memory.run(update), /duplicate-write/)
  await assert.rejects(memory.run({ command: 'remember', args: ['new fact', '--title', 'title', '--parent', next] }), /shown-parent-required/)
  await memory.run({ command: 'remember', args: ['new fact', '--title', 'title', '--parent', id] })
  assert.throws(() => memory.finish(JSON.stringify({ result: 'stored', ids: [id] })), /archive-unverified/)
  await assert.rejects(memory.run({ command: 'show', args: [next] }), /invalid-readback/)
  assert.throws(() => memory.finish(JSON.stringify({ result: 'stored', ids: [id] })), /archive-unverified/)
  wrongShow = false
  await memory.run({ command: 'show', args: [next] })
  assert.deepEqual(memory.finish(JSON.stringify({ result: 'stored', ids: [id, next] })).records, [id, next])
})

test('archive tools reject destructive operations, secrets, plan writes and unconfirmed retries', async () => {
  const call = async () => ({ status: 'ok', summary: { id } })
  const memory = memoryTools(call)
  await prime(memory)
  await assert.rejects(memory.run({ command: 'restart', args: [] }), /invalid-memory-call/)
  await assert.rejects(memory.run({ command: 'remember', args: ['fact', '--force'] }), /forbidden-memory-option/)
  await assert.rejects(memory.run({ command: 'taxonomy', args: ['--ensure', 'new'] }), /forbidden-memory-option/)
  await assert.rejects(memory.run({ command: 'agent-config', args: ['--set', 'diary_mode=verbose'] }), /forbidden-memory-option/)
  await assert.rejects(memory.run({ ...update, args: [...update.args, 'password=hidden'] }), /secret-content/)
  const plan = memoryTools(call, { readOnly: true })
  await prime(plan)
  await assert.rejects(plan.run(update), /read-only/)
  let writes = 0
  const uncertain = memoryTools(async args => {
    if (args[0] === 'update') { writes++; throw new Error('timeout') }
    return call()
  })
  await prime(uncertain)
  await assert.rejects(uncertain.run(update), /timeout/)
  await assert.rejects(uncertain.run({ ...update, args: [...update.args, '--importance', 'important'] }), /read-before-write/)
  assert.equal(writes, 1)
  assert.throws(() => uncertain.finish('{"result":"nothing-to-store","ids":[]}'), /archive-unconfirmed/)
})

test('an empty successful recall still permits policy reading and an authorized new fact', async () => {
  const memory = memoryTools(async args => args[0] === 'recall'
    ? { status: 'skip', summary: { count: 0 } }
    : { status: 'ok', summary: { id } })
  await prime(memory)
  await memory.run(update)
  await memory.run(read('show'))
  assert.equal(memory.finish(JSON.stringify({ result: 'stored', ids: [id] })).result, 'stored')
})

test('background worker reads the exact turn, exposes a memory tool and verifies completion', async () => {
  let settings
  let closed = false
  const result = await archiveTurn({ session_id: 'parent', turn_id: 'target', cwd: process.cwd(), model: 'inherited-model' }, {
    call: async () => ({ status: 'ok', summary: { id } }),
    connect: options => ({
      notify() {}, close() { closed = true }, exited: new Promise(() => {}),
      async request(method, params) {
        if (method === 'config/read') return { config: { mcp_servers: { external: { enabled: true } } } }
        if (method === 'thread/read') return { thread: { modelProvider: 'configured-provider', turns: [{ id: 'target', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'read-only project check' }] }, { type: 'agentMessage', text: 'checked' }] }] } }
        if (method === 'thread/start') { settings = params; return { thread: { id: 'worker' } } }
        if (method === 'turn/start') {
          for (const command of ['recall', 'prompt', 'show']) {
            const response = await options.onRequest({ method: 'item/tool/call', params: { tool: 'respire_memory', arguments: read(command) } })
            assert.equal(response.success, true)
          }
          options.onNotification({ method: 'item/completed', params: { item: { type: 'agentMessage', text: JSON.stringify({ result: 'already-stored', ids: [id] }) } } })
          options.onNotification({ method: 'turn/completed', params: { turn: { status: 'completed' } } })
        }
        return {}
      },
    }),
  })
  assert.equal(settings.ephemeral, true)
  assert.equal(settings.sandbox, 'read-only')
  assert.equal(settings.config.features.hooks, false)
  assert.equal(settings.config.features.apps, false)
  assert.equal(settings.config.features.shell_tool, false)
  assert.deepEqual(settings.config.mcp_servers, { external: { enabled: false } })
  assert.equal(settings.model, 'inherited-model')
  assert.equal(settings.modelProvider, 'configured-provider')
  assert.equal(settings.dynamicTools.length, 1)
  assert.equal(result.result, 'already-stored')
  assert.equal(closed, true)
})

test('Stop releases its state lock, records failure and never retries a replay', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'respire archive '))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const event = { session_id: 'session', turn_id: 'one', cwd: process.cwd(), prompt: 'known project', hook_event_name: 'UserPromptSubmit' }
  let started
  let release
  const running = new Promise(resolve => { started = resolve })
  const wait = new Promise(resolve => { release = resolve })
  let archives = 0
  const options = { dataDir, call: async () => ({ status: 'ok', details: [] }), archive: async () => { archives++; started(); await wait; throw new Error('unconfirmed') } }
  await handleHook(event, options)
  const stop = { ...event, hook_event_name: 'Stop' }
  const work = handleHook(stop, options)
  await running
  await handleHook({ ...event, turn_id: 'two' }, options)
  assert.deepEqual(await handleHook(stop, options), {})
  release()
  assert.match((await work).systemMessage, /archive-unconfirmed/)
  assert.deepEqual(await handleHook(stop, options), {})
  assert.equal(archives, 1)
})

test('Codex JSON transport handles a real subprocess, Unicode and cancellation', async () => {
  const abort = new AbortController()
  const script = `const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const m=JSON.parse(line);console.log(JSON.stringify({id:m.id,result:m.params}))})`
  const client = connectCodex({ signal: abort.signal, spawnProcess: (file, args, options) => {
    assert.ok(args.includes('hooks'))
    assert.ok(args.includes('mcp_servers={}'))
    return spawn(process.execPath, ['-e', script], options)
  } })
  const value = { text: '中文 "quotes"\nsecond line & $()' }
  assert.deepEqual(await client.request('echo', value), value)
  abort.abort()
  await assert.rejects(client.request('echo', value), /cancelled/)
  await client.exited
})
