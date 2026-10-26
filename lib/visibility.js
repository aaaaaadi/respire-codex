import { validId } from './memory.js'

// These instructions request visible prose; they do not manufacture a native tool card.
export function visibleContext(notice, previous, details) {
  return [
    '【respire·可见提示】请在本轮首条可见回复中简短转述这一行：',
    [notice, previous].filter(Boolean).join('；'),
    '候选不等于采用。仅在成功读取正文且实际用于本次回答后，补一句“已参考记忆：〈标题〉”（最多2条，可并入已有进度说明）。未采用则在最终回复末简写“记忆：本次未采用”。不要照抄示例、泄露敏感正文、提前宣称本轮已保存，或重复播报。',
    details,
  ].filter(Boolean).join('\n')
}

function archiveOutcome(current) {
  const archive = current.archive
  if (!archive) return current.stored ? '已返回写入回执，回读未确认' : '尚无保存回执'
  if (archive.status === 'running') return '仍在后台整理'
  if (archive.status !== 'completed') return '保存未确认'
  if (archive.result === 'read-only') return '只读模式，未保存'
  if (archive.result === 'nothing-to-store') return '无新增需保存'
  const checked = Array.isArray(archive.checkedRecords) ? archive.checkedRecords.filter(validId) : []
  if (archive.result === 'already-stored' && checked.length) return '已存在，无需重复保存'
  if (archive.result === 'stored' && Array.isArray(archive.records) && archive.records.length && archive.records.every(validId)) {
    return archive.records.every(id => checked.includes(id)) ? '已保存并回读确认' : '已返回写入回执，回读未确认'
  }
  return '保存结果未确认'
}

// Only the latest old turn is admitted on upgrade; new turns opt in explicitly.
// Late results remain eligible, but an unchanged outcome is emitted at most once.
export function previousNotice(state) {
  const entries = Object.entries(state.turns)
  const latest = entries.at(-1)?.[0]
  if (!state.visibilityInitialized) {
    state.visibilityInitialized = true
    if (latest) state.turns[latest].noticeEligible = true
  }
  const candidates = entries.reverse().filter(([, value]) => value.noticeEligible)
    .map(([key, value]) => ({ key, value, outcome: archiveOutcome(value) }))
    .filter(({ value, outcome }) => value.noticeOutcome !== outcome)
  const selected = candidates.find(({ value }) => value.archive && value.archive.status !== 'running') ?? candidates[0]
  if (!selected) return ''
  selected.value.noticeOutcome = selected.outcome
  return `${selected.key === latest ? '上轮' : '较早回合'}记忆：${selected.outcome}`
}
