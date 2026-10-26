import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleHook } from '../lib/hook.js'
import { withState, keyOf } from '../lib/state.js'

const id = '12345678-1234-1234-1234-123456789012'
const hit = { id, title: '项目使用中文提交', score: 0.8 }
const base = { session_id: 'visibility', turn_id: 'first', cwd: process.cwd(), prompt: '项目约定是什么', hook_event_name: 'UserPromptSubmit' }
const text = output => output.hookSpecificOutput?.additionalContext ?? ''
async function setup(t, response = { status: 'ok', details: [hit] }) {
  const dataDir = await mkdtemp(join(tmpdir(), 'respire-visibility-'))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  return { dataDir, call: async () => response }
}
test('visible recall counts only safe delivered candidates and distinguishes empty from unavailable', async t => {
  for (const [response, expected] of [
    [{ status: 'ok', details: [hit, { ...hit, title: 'password=hidden' }] }, /记忆：召回 1 条候选/],
    [{ status: 'skip', summary: { count: 0 } }, /记忆：未找到候选/],
    [{ status: 'skip', summary: { reason: 'paused' } }, /记忆：召回已跳过/],
    [{ status: 'fail' }, /记忆：召回不可用/],
  ]) {
    const output = text(await handleHook(base, await setup(t, response)))
    assert.match(output, expected)
    assert.doesNotMatch(output, /password=hidden/)
  }
})
test('prior storage requires nonempty written IDs and readback of every written ID', async t => {
  for (const [archive, expected] of [
    [{ status: 'completed', result: 'read-only', records: [], checkedRecords: [] }, /上轮记忆：只读模式，未保存/],
    [{ status: 'completed', result: 'stored', records: [id], checkedRecords: [id] }, /上轮记忆：已保存并回读确认/],
    [{ status: 'completed', result: 'stored', records: [id], checkedRecords: [] }, /上轮记忆：已返回写入回执，回读未确认/],
    [{ status: 'completed', result: 'stored', records: [] }, /上轮记忆：保存结果未确认/],
    [{ status: 'unconfirmed', error: 'token=hidden', records: [id] }, /上轮记忆：保存未确认/],
    [{ status: 'running' }, /上轮记忆：仍在后台整理/],
    [{ status: 'completed', result: 'nothing-to-store', records: [] }, /上轮记忆：无新增需保存/],
    [{ status: 'completed', result: 'already-stored', checkedRecords: [id] }, /上轮记忆：已存在，无需重复保存/],
  ]) {
    const options = await setup(t)
    await withState(options.dataDir, base.session_id, async (state, save) => { state.turns.old = { archive }; await save(state) })
    const output = text(await handleHook(base, options))
    assert.match(output, expected)
    assert.doesNotMatch(output, /token=hidden/)
    if (!archive.checkedRecords?.length) assert.doesNotMatch(output, /上轮记忆：已保存并回读确认/)
  }
})
test('late completion is reported once, is session isolated, and does not replay pre-upgrade history', async t => {
  const options = await setup(t)
  await withState(options.dataDir, base.session_id, async (state, save) => {
    state.turns.ancient = { archive: { status: 'completed', result: 'nothing-to-store' } }
    await save(state)
  })
  await handleHook(base, options)
  await withState(options.dataDir, base.session_id, async (state, save) => {
    state.turns[keyOf(base.turn_id)].archive = { status: 'running' }; await save(state)
  })
  assert.match(text(await handleHook({ ...base, turn_id: 'second' }, options)), /上轮记忆：仍在后台整理/)
  await withState(options.dataDir, base.session_id, async (state, save) => {
    state.turns[keyOf(base.turn_id)].archive = { status: 'completed', result: 'stored', records: [id], checkedRecords: [id] }
    await save(state)
  })
  assert.match(text(await handleHook({ ...base, turn_id: 'third' }, options)), /较早回合记忆：已保存并回读确认/)
  assert.doesNotMatch(text(await handleHook({ ...base, turn_id: 'fourth' }, options)), /已保存并回读确认|无新增需保存/)
  assert.doesNotMatch(text(await handleHook({ ...base, session_id: 'other' }, options)), /上轮记忆|较早回合记忆/)
})
test('skip and explicit writes have accurate concise notices without touching retrieval on skip', async t => {
  const options = await setup(t)
  options.call = () => assert.fail('skip must not call engine')
  assert.match(text(await handleHook({ ...base, prompt: '/nomem hello' }, options)), /记忆：本条已跳过召回/)
  const explicit = await setup(t, { status: 'ok', summary: { id } })
  const output = text(await handleHook({ ...base, prompt: '记住：项目使用中文' }, explicit))
  assert.match(output, /记忆：已返回写入回执，待回读核验/)
  assert.doesNotMatch(output, /已保存并回读确认/)
})
