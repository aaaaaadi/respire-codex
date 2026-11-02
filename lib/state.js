import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const keyOf = text => createHash('sha256').update(text).digest('hex')

// Only ESRCH proves absence. Live/reused PIDs, unknown owners and permission
// errors remain locked; age alone never grants recovery permission.
async function recoverExitedOwner(lock) {
  let raw, owner
  try { raw = await readFile(lock, 'utf8'); owner = JSON.parse(raw) } catch { return }
  if (owner?.version !== 1 || owner.host !== hostname() ||
      !Number.isSafeInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.token !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(owner.token)) return
  try { process.kill(owner.pid, 0); return } catch (error) { if (error.code !== 'ESRCH') return }
  // Serialize reclaimers for this exact generation. A crash during recovery
  // leaves this guard in place for manual review rather than risking overlap.
  const guard = `${lock}.${owner.token}.recovery`
  let claim
  try { claim = await open(guard, 'wx', 0o600) } catch (error) {
    if (error.code === 'EEXIST') return
    throw error
  }
  try {
    if (await readFile(lock, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    }) !== raw) return
    try { process.kill(owner.pid, 0); return } catch (error) { if (error.code !== 'ESRCH') return }
    await unlink(lock)
  } finally {
    await claim.close()
    await unlink(guard)
  }
}

export async function withState(root, session, action) {
  const directory = join(root, 'sessions')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, `${keyOf(session)}.json`)
  const lock = `${file}.lock`
  let handle
  for (let attempt = 0; attempt < 20; attempt++) {
    try { handle = await open(lock, 'wx', 0o600); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      await recoverExitedOwner(lock)
      await delay(50)
    }
  }
  if (!handle) throw new Error('state-busy')
  const save = async state => {
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, JSON.stringify(state), { mode: 0o600 })
      await rename(temp, file)
    } finally {
      await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, host: hostname(), token: randomUUID() }))
    let state = { turns: {} }
    try { state = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw new Error('invalid-state') }
    if (!state || !state.turns || typeof state.turns !== 'object' || Array.isArray(state.turns)) throw new Error('invalid-state')
    return await action(state, save)
  } finally {
    await handle.close()
    await unlink(lock)
  }
}
