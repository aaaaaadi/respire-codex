import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareArchiveContext, parseExtraction, readEvidence } from '../lib/archive-context.js'

test('large tool output is bounded with head/tail evidence and explicit partial coverage', () => {
  const context = prepareArchiveContext([
    { type: 'userMessage', content: [{ type: 'text', text: 'Do not deploy until approved.' }] },
    { type: 'commandExecution', command: 'run checks', exitCode: 1, aggregatedOutput: 'START '+ 'x'.repeat(200000) + 'CRITICAL_MIDDLE_ONLY' + 'x'.repeat(200000) + ' FAILURE at end' },
    { type: 'agentMessage', text: 'Checks failed; deployment has not happened.', phase: 'final' },
  ])
  assert.equal(context.chunks.length, 1)
  assert.equal(context.coverage, 'partial')
  const text = JSON.stringify(context.chunks)
  assert.ok(text.length < 64000)
  assert.match(text, /FAILURE at end/)
  assert.match(text, /Do not deploy until approved/)
  assert.match(text, /exitCode/)
  const middle = context.fragments.find(fragment => fragment.text.includes('CRITICAL_MIDDLE_ONLY'))
  assert.ok(middle)
  assert.deepEqual(readEvidence(context.fragments, [middle.source]), [middle])
  assert.ok(!context.chunks.flat().some(fragment => fragment.source === middle.source))
})

test('long dialogue is split without losing a later correction or any user text', () => {
  const text = 'quoted "\\ 中文😀\n'.repeat(24000) + 'CORRECTION: no merge authorized.'
  const context = prepareArchiveContext([{ type: 'userMessage', content: [{type:'text',text}] }, {type:'agentMessage',text:'Understood.'}])
  assert.ok(context.chunks.length > 1)
  assert.ok(context.chunks.every(chunk => JSON.stringify(chunk).length <= 48000))
  const actual = context.chunks.flat().filter(x => x.type === 'userMessage').map(x => x.text).join('')
  assert.equal(actual, text)
  assert.equal(context.coverage, 'complete')
  assert.equal(context.userSources.length, context.chunks.flat().filter(x=>x.type==='userMessage').length)
})

test('extraction validates source provenance and rejects oversized or invented evidence', () => {
  const sources = [{source:'item-0-part-0',type:'userMessage',text:'No deployment'}]
  const valid = JSON.stringify({facts:[],constraints:[{text:'No deployment',sources:['item-0-part-0']}]})
  assert.equal(parseExtraction(valid, sources).constraints.length, 1)
  assert.throws(()=>parseExtraction(valid.replace('item-0-part-0','invented'),sources), /invalid-extraction/)
  assert.throws(()=>parseExtraction('x'.repeat(6001),sources), /extraction-output-limit/)
  assert.throws(()=>parseExtraction(JSON.stringify({facts:[{text:'done',status:'verified',sources:['item-0-part-0']}],constraints:[]}),sources), /invalid-extraction/)
  assert.deepEqual(readEvidence(sources, ['item-0-part-0']), sources)
  assert.throws(()=>readEvidence(sources,['missing']), /invalid-evidence/)
})

test('ordinary tools retain middle evidence and use the existing direct budget', () => {
  const middle = 'UNIQUE_RESULT_IN_MIDDLE'
  const item = { type: 'commandExecution', exitCode: 0, aggregatedOutput: 'a'.repeat(4000) + middle + 'b'.repeat(4000) }
  const context = prepareArchiveContext([item, { type: 'agentMessage', text: 'ordinary dialogue '.repeat(5000) }])
  assert.equal(context.chunks.length, 1)
  assert.equal(context.clippedTools, 0)
  assert.equal(context.coverage, 'complete')
  assert.match(JSON.stringify(context.chunks), /UNIQUE_RESULT_IN_MIDDLE/)
  const sources = context.fragments.filter(fragment => fragment.type === 'commandExecution').map(fragment => fragment.source)
  assert.equal(readEvidence(context.fragments, sources).map(fragment => fragment.text).join(''), JSON.stringify(item))
})

test('too much dialogue fails explicitly before starting model or memory operations', () => {
  assert.throws(()=>prepareArchiveContext([{type:'agentMessage',text:'x'.repeat(700000)}]), /archive-segment-limit/)
})
