# Reliable Turn Archive Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Fix missed archives after empty recall and oversized current turns.
**Architecture:** Compact tool evidence, split oversized dialogue, extract with tool-free workers, then perform one deduplicated verified archive.
**Tech Stack:** Node.js >=24, node:test, Codex app-server, rsrs client-only.
**Spec:** docs/superpowers/specs/2026-10-26-reliable-turn-archive.md

## Global Constraints
- Work in the explicitly requested dedicated checkout and feature branch.
- Keep one plugin identity, existing Runtime, account and memory library.
- No PR until user tests and approves. Never edit hook trust or restart Codex automatically.
- 64,000 direct characters; 48,000 per chunk; 12 chunks; 6,000 extraction output; 280 seconds overall.
- Never write until all extraction completes; uncertain writes are never retried.

## Review Focus
- Empty recall vs paused/error envelopes: only successful zero hits enable archival.
- Very long user restrictions and later corrections survive in full source fragments; never drop authorization to meet a budget.
- Tool evidence clipping must be visible and must not convert an assertion to verified success.
- Multi-worker notifications/cancellation cannot complete the wrong stage or allow writes after timeout.
- Installation keeps official rollback and avoids duplicate hooks; real storage verification uses authorized facts.

### Task 1: Empty recall eligibility
**Files:** lib/hook.js, test/hook.test.js
**Interfaces:** handleHook(event, options) accepts skip/count=0 recall as ready.
- [ ] Write tests for zero-result Stop once, paused/error skip suppression.
- [ ] Run node --test test/hook.test.js; Expected: zero-result test fails first.
- [ ] Implement narrow readiness condition and verify full hook tests pass.
- [ ] Commit exact changed files.

### Task 2: Bounded context and extraction
**Files:** lib/archive-context.js (new), lib/archive.js, lib/hook.js, test/archive-context.test.js (new), test/archive.test.js
**Interfaces:** prepareArchiveContext(items) returns chunks, coverage, metadata; extractCandidates(text, sources) validates bounded source-linked facts.
- [ ] Add failing compaction, splitting, correction, oversized, unknown-source and pipeline failure tests.
- [ ] Run node --test test/archive-context.test.js test/archive.test.js; Expected: new tests fail on baseline.
- [ ] Implement pure context preparation and sequential tool-free extraction; wire final worker only after successful extraction.
- [ ] Persist metadata-only progress and verified/read-back IDs; keep failure and cancellation fail-closed.
- [ ] Run npm test; Expected: all tests pass.
- [ ] Commit exact changed files.

### Task 3: Packaging, rollout and live validation
**Files:** README.md, README.zh-CN.md, package.json, .codex-plugin/plugin.json, scripts/check-package.js, local deployment files outside repository
- [ ] Document limits, partial coverage and zero-match behavior; distinguish local prerelease.
- [ ] Run npm run check, npm test, npm run verify:package; Expected: success.
- [ ] Independent final code review, fix material findings with regression tests.
- [ ] Back up official package/registration pointers, install through marketplace tooling without editing trust.
- [ ] Verify real recall, authorized archival and same-ID readback; report desktop/restart boundary.
- [ ] Push feature branch to origin, verify clean/synchronized checkout. Do not create PR.
