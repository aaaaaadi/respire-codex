import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export function connectCodex({ cwd, signal, onRequest, onNotification, spawnProcess = spawn } = {}) {
  const executable = process.env.RESPIRE_CODEX_PATH || process.env.CODEX_APP_RUNTIME_CLI_PATH || 'codex'
  const args = ['app-server', '--stdio', '--disable', 'hooks', '--disable', 'plugins', '--disable', 'apps', '--disable', 'shell_tool', '--disable', 'unified_exec', '-c', 'mcp_servers={}', '-c', 'web_search="disabled"']
  const windows = process.platform === 'win32'
  // Only constant startup arguments go through cmd; conversation data uses JSON stdin.
  const wrapper = windows && executable === 'codex'
  const child = spawnProcess(wrapper ? (process.env.ComSpec || 'cmd.exe') : executable,
    wrapper ? ['/d', '/s', '/c', 'codex', ...args] : args,
    { cwd, windowsHide: true, detached: !windows, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let sequence = 0
  let failure
  let closing = false
  let finishExit
  const exited = new Promise(resolve => { finishExit = resolve })
  const send = message => child.stdin.write(JSON.stringify(message) + '\n')
  const fail = code => {
    failure ||= code
    for (const request of pending.values()) request.reject(new Error(failure))
    pending.clear()
  }
  const close = () => {
    fail('codex-closed')
    if (closing || child.exitCode !== null || child.signalCode !== null || !child.pid) return
    closing = true
    if (windows) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
    else {
      try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL') }
    }
  }
  const abort = () => { fail('cancelled'); close() }
  signal?.addEventListener('abort', abort, { once: true })
  child.stderr.resume()
  child.stdin.on('error', () => fail('codex-transport'))
  child.once('error', () => { fail('codex-unavailable'); finishExit() })
  child.once('close', () => {
    fail('codex-closed')
    signal?.removeEventListener('abort', abort)
    finishExit()
  })
  const input = createInterface({ input: child.stdout })
  input.on('line', line => {
    if (line.length > 32 * 1024 * 1024) { fail('codex-output-limit'); close(); return }
    let message
    try { message = JSON.parse(line) } catch { fail('codex-invalid-output'); close(); return }
    if (!message.method && message.id !== undefined && pending.has(message.id)) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request.reject(new Error('codex-request-failed'))
      else request.resolve(message.result)
    } else if (message.id !== undefined) {
      Promise.resolve().then(() => onRequest(message)).then(result => send({ id: message.id, result }), () => {
        send({ id: message.id, error: { code: -32601, message: 'Unsupported request' } })
      }).catch(() => fail('codex-transport'))
    } else {
      try { onNotification?.(message) } catch { fail('codex-invalid-event'); close() }
    }
  })
  if (signal?.aborted) abort()
  return {
    request(method, params) {
      if (failure) return Promise.reject(new Error(failure))
      return new Promise((resolve, reject) => {
        const id = ++sequence
        pending.set(id, { resolve, reject })
        send({ id, method, params })
      })
    },
    notify: (method, params = {}) => send({ method, params }),
    close,
    exited,
  }
}
