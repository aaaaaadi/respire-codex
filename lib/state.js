import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const keyOf = text => createHash('sha256').update(text).digest('hex')

export async function withState(root, session, action) {
  const directory = join(root, 'sessions')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, `${keyOf(session)}.json`)
  const lock = `${file}.lock`
  let handle
  for (let attempt = 0; attempt < 20; attempt++) {
    try { handle = await open(lock, 'wx', 0o600); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
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
    let state = { turns: {} }
    try { state = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw new Error('invalid-state') }
    if (!state || !state.turns || typeof state.turns !== 'object' || Array.isArray(state.turns)) throw new Error('invalid-state')
    return await action(state, save)
  } finally {
    await handle.close()
    await unlink(lock)
  }
}
