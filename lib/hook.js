import { runRsrs } from './rsrs.js'
import { keyOf, withState } from './state.js'
import { RULES, NUDGE, STORE_PREFIX, SKIP_PREFIX, containsSecret, titleOf, recallText, storeText, record } from './memory.js'

const context = (event, text) => text ? { hookSpecificOutput: { hookEventName: event, additionalContext: text } } : {}
const warning = code => ({ systemMessage: `Respire: ${code}。当前任务继续；检查 rsrs --client-only status --json。` })

export async function handleHook(event, { dataDir = process.env.PLUGIN_DATA, call, signal } = {}) {
  if (!record(event) || typeof event.session_id !== 'string' || !event.session_id || typeof event.cwd !== 'string') throw new Error('invalid-input')
  const name = event.hook_event_name
  if (!['SessionStart', 'UserPromptSubmit', 'Stop'].includes(name)) return {}
  const execute = call ?? (args => runRsrs(args, { cwd: event.cwd, executable: process.env.RESPIRE_RSRS_PATH || 'rsrs', signal }))
  if (name === 'SessionStart') {
    let text = RULES
    try {
      const status = await execute(['status'])
      if (status.status !== 'ok') text += '\n【respire·状态】引擎不可用或已暂停；遵循引擎模式，不强制查存。'
      if (status.summary?.unlocked === false) text += '\n【respire·状态】记忆库未解锁，请用户按rsrs交互流程解锁，不收集密码。'
      if (status.summary?.session?.has_session === false) text += '\n【respire·状态】尚未登录，请按rsrs交互流程配置账号。'
    } catch { text += '\n【respire·状态】引擎或runtime不可用，请核实rsrs安装及宿主runtime。当前任务继续。' }
    return context(name, text)
  }
  if (!dataDir) return warning('PLUGIN_DATA-missing')
  if (typeof event.turn_id !== 'string' || !event.turn_id) throw new Error('turn-id-missing')
  return withState(dataDir, event.session_id, async (state, save) => {
    const turn = keyOf(event.turn_id)
    if (name === 'Stop') {
      const current = state.turns[turn]
      if (event.stop_hook_active || !current || current.phase !== 'done' || !current.ready || current.stored || current.reminded || current.continuation) return {}
      current.reminded = true
      state.continuation = `[respire:stop:${keyOf(event.session_id).slice(0, 16)}] ${NUDGE}`
      await save(state)
      return { decision: 'block', reason: state.continuation }
    }
    if (typeof event.prompt !== 'string') throw new Error('prompt-missing')
    if (state.turns[turn]) return context(name, '【respire·重复事件】本回合已处理或结果未确认，不重复查存；需要时先查库核实。')
    // Persist intent before any write. A crash must never cause an automatic retry.
    const current = { phase: 'processing', ready: false, stored: false, reminded: false }
    state.turns[turn] = current
    state.turns = Object.fromEntries(Object.entries(state.turns).slice(-32))
    const prompt = event.prompt.trim()
    if (state.continuation && prompt === state.continuation) {
      current.continuation = true
      current.phase = 'done'
      delete state.continuation
      await save(state)
      return {}
    }
    delete state.continuation
    await save(state)
    let text = ''
    const store = STORE_PREFIX.exec(prompt)
    if (!prompt || SKIP_PREFIX.test(prompt)) {
      // /nomem skips this input's recall only; the bounded stop reminder remains available.
      current.ready = !!prompt
    } else if (containsSecret(prompt)) {
      text = '【respire·已跳过】输入含疑似凭据，未发送给记忆引擎。仅提供去除秘密的事实或安全的位置指针。'
    } else if (store && event.permission_mode === 'plan') {
      text = '【respire·未存】当前为plan模式，不执行存储。'
    } else {
      try {
        if (store) {
          const content = prompt.slice(store[0].length).trim()
          if (!content) text = '【respire·未存】内容为空，请提供要保存的事实。'
          else {
            const result = storeText(await execute(['remember', content, '--title', titleOf(content), '--importance', 'important']))
            current.stored = result.stored
            current.ready = true
            text = result.text
          }
        } else if (prompt.length >= 2) {
          const query = prompt.replace(/^\$\s*skill\s*:\s*\S+\s*/i, '').trim() || prompt
          const doc = await execute(['recall', query.slice(0, 8000), '--limit', '5', '--titles'])
          text = recallText(doc)
          current.ready = doc.status === 'ok'
        }
      } catch {
        text = store
          ? '【respire·落库未确认】可能已写入，先查库核实，勿自动重试或声称成功。'
          : '【respire·召回不可用】未获得记忆，请依据当前材料继续；核实宿主runtime。'
      }
    }
    current.phase = 'done'
    await save(state)
    return context(name, text)
  })
}

export async function main() {
  const abort = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort())
  try {
    const chunks = []
    let size = 0
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > 1024 * 1024) throw new Error('input-limit')
      chunks.push(chunk)
    }
    const event = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    console.log(JSON.stringify(await handleHook(event, { signal: abort.signal })))
  } catch {
    console.log(JSON.stringify(warning('hook-failed')))
  }
}
