# Reliable current-turn memory archival
## Approved scope
Repair the Codex plugin locally, preserve an official rollback package, push a feature branch to the user's Fork, and wait for user acceptance before opening an upstream PR. Keep the existing Runtime and library.
## Approaches
A fixed last-N window still overflows on one large turn and repeats old material. Final-answer-only extraction loses corrections and evidence. Use the approved current-turn compaction plus bounded, read-only extraction for oversized turns.
## Design
- Empty successful recall (skip with count=0) remains eligible for Stop. Paused/error responses remain ineligible.
- Preserve complete user/assistant text in ordered source fragments. Represent tool calls with bounded head/tail evidence, status and an explicit partial marker.
- Direct archival uses at most 64,000 serialized characters. Larger inputs are split into <=48,000-character chunks; at most 12 chunks. Reject larger inputs explicitly before any write.
- Each extraction worker has no tools. It produces <=6,000 characters of evidence-linked JSON candidates and restrictions. Only one final worker may access memory and write after ALL chunks are extracted. Candidates remain untrusted summaries; retain original user messages/restrictions, source references and final outcomes for verification.
- The final candidate envelope is bounded to 128,000 characters. For user fragments too long to inline, a read-only current-turn evidence tool must read every original user fragment before any write.
- Keep the 280-second total timeout; record safe stage/coverage/counts on failure. No retry of uncertain writes, no transcript content persisted in hook state. Readback remains mandatory.
- Mark coverage as partial when tool output was trimmed; never infer unseen evidence. No automatic replay of old failed hooks.
## Acceptance
Regression tests must cover empty vs paused recall, oversized tool output, long dialogue split/reassembly, corrections/authorization preservation, extraction failure before writes, cancellation, duplicate Stop and receipt/readback. Exercise actual model/Runtime paths using authorized real facts, not fabricated memory records. Desktop natural hook acceptance is separate from a shell-driven probe.
