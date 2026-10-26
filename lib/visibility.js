import { validId } from './memory.js'

// These instructions request visible prose; they do not manufacture a native tool card.
export function visibleContext(notice, previous, details) {
  return [
    '【respire·可见提示】仅在用户未要求严格JSON、固定格式或只输出指定内容时，首条可见回复用单独一行显示以下英文短标签；不要为显示状态新增回复。用户要求严格格式时省略所有状态标签，包括Used和unused：',
    [notice, previous].filter(Boolean).join(' · '),
    '候选不等于采用。仅在成功读取正文且实际用于回答后，单独输出 Used: 后接真实记忆ID前8位；多条以逗号分隔，不编造ID，遇前缀歧义则延长至可区分。默认不显示标题、正文、完整ID或格式示例；用户询问依据时再展开。未采用则最终简写 Memory: unused。没有上轮回执时省略保存标签，不猜测本轮保存结果，不重复播报。',
    details,
  ].filter(Boolean).join('\n')
}

// Preserve persisted outcome values so translation does not replay old notices.
const OUTCOME_LABELS = {
  '已返回写入回执，回读未确认': 'unverified',
  '仍在后台整理': 'pending',
  '保存未确认': 'unconfirmed',
  '只读模式，未保存': 'read-only',
  '无新增需保存': 'not needed',
  '已存在，无需重复保存': 'already exists',
  '已保存并回读确认': 'verified',
  '保存结果未确认': 'unconfirmed',
}

function archiveOutcome(current) {
  const archive = current.archive
  if (!archive) return current.stored ? '已返回写入回执，回读未确认' : ''
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
    .filter(({ value, outcome }) => outcome && value.noticeOutcome !== outcome)
  const selected = candidates.find(({ value }) => value.archive && value.archive.status !== 'running') ?? candidates[0]
  if (!selected) return ''
  selected.value.noticeOutcome = selected.outcome
  return `${selected.key === latest ? 'Last' : 'Earlier'} save: ${OUTCOME_LABELS[selected.outcome]}`
}
