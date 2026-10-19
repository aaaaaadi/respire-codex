import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runRsrs } from '../lib/rsrs.js'
import { execFileSync } from 'node:child_process'

async function executable(t, body) {
  const root = await mkdtemp(join(tmpdir(), 'respire runner '))
  t.after(() => rm(root, { recursive: true, force: true }))
  const file = join(root, process.platform === 'win32' ? 'fixture.ps1' : 'fixture')
  await writeFile(file, process.platform === 'win32' ? body.windows : `#!${process.execPath}\n${body.posix}`)
  await chmod(file, 0o700)
  return file
}

test('real child transports Unicode, quotes, newlines and shell metacharacters verbatim', async t => {
  const file = await executable(t, {
    windows: 'ConvertTo-Json -Compress -Depth 8 @{status="ok"; details=@($args)}',
    posix: 'console.log(JSON.stringify({status:"ok",details:process.argv.slice(2)}))',
  })
  const input = '中文 "quoted" & | $(echo unsafe);\nnext'
  const doc = await runRsrs(['recall', input], { executable: file })
  assert.deepEqual(doc.details, ['--client-only', 'recall', input, '--json'])
})

test('malformed and unavailable executable return category only', async t => {
  const file = await executable(t, { windows: 'Write-Output "password=hidden"', posix: 'console.log("password=hidden")' })
  await assert.rejects(runRsrs([], { executable: file }), /invalid-output/)
  await assert.rejects(runRsrs([], { executable: 'missing-respire-test-executable' }), /unavailable|failed/)
})

test('pending on nonzero exit is a valid uncommitted result', async t => {
  const file = await executable(t, { windows: 'Write-Output \'{"status":"pending"}\'; exit 1', posix: 'console.log(JSON.stringify({status:"pending"}));process.exitCode=1' })
  assert.equal((await runRsrs([], { executable: file })).status, 'pending')
})

test('timeout and cancellation terminate real child processes', async t => {
  const file = await executable(t, { windows: 'Start-Sleep -Seconds 20', posix: 'setTimeout(()=>{},20000)' })
  await assert.rejects(runRsrs([], { executable: file, timeoutMs: 500 }), /timeout/)
  await assert.rejects(runRsrs([], { executable: file, signal: AbortSignal.abort() }), /cancelled/)
})

test('Windows native executable receives exact CRT arguments', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'respire native '))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'argv.cs')
  const file = join(root, 'argv.exe')
  await writeFile(source, `using System; using System.Text; public class Argv { public static void Main(string[] args) { var values = Array.ConvertAll(args, s => Convert.ToBase64String(Encoding.UTF8.GetBytes(s))); Console.Write("{\\"status\\":\\"ok\\",\\"details\\":\\"" + string.Join(".", values) + "\\"}"); } }`)
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -TypeDefinition (Get-Content -LiteralPath $env:ARGV_SOURCE -Raw) -OutputAssembly $env:ARGV_EXE -OutputType ConsoleApplication'], { env: { ...process.env, ARGV_SOURCE: source, ARGV_EXE: file }, windowsHide: true })
  const input = '中文 "quotes" \\ slash\\ " & | $(echo unsafe)\nnext'
  const doc = await runRsrs(['recall', input], { executable: file })
  assert.deepEqual(doc.details.split('.').map(value => Buffer.from(value, 'base64').toString('utf8')), ['--client-only', 'recall', input, '--json'])
})
