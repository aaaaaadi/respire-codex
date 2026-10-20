# Respire for Codex

English | [简体中文](https://github.com/risense-ai/respire-codex/blob/main/README.zh-CN.md)

**npm package: [@rsrsai/codex](https://www.npmjs.com/package/@rsrsai/codex)**

## Install with AI — copy this prompt

Paste the entire prompt into **your local Codex chat**:

```text
Install the Respire memory plugin @rsrsai/codex for my local Codex. Read and
follow https://github.com/risense-ai/respire-codex#readme, then perform the
installation rather than only explaining the steps.

Check Node.js 24+, npm, Git, and Codex plugin/hooks support. Reuse my existing
rsrs environment; if rsrs is missing, install it with npm install -g @rsrsai/cli@latest.
On Windows, check PowerShell 7.3+ for npm/pnpm rsrs wrappers, or configure
RESPIRE_RSRS_PATH to an existing native rsrs.exe. Run rsrs --version and
rsrs --client-only status --json. Report any required login, library unlock,
model setup, or host runtime action for me to complete in rsrs; do not request
secrets in chat or manage the runtime yourself.

Check existing plugin/marketplace registration first to avoid duplicates. Add
the marketplace if missing with:
codex plugin marketplace add risense-ai/respire-codex --ref main
Then install its npm-backed entry if missing with:
codex plugin add respire@rsrsai
Use the npm package, not a Git package dependency. Do not replace my memory
library, account configuration, AGENTS.md, or other existing hooks.

Verify that Respire is installed and enabled. Tell me when to restart Codex
and open /hooks to personally review and trust SessionStart, UserPromptSubmit,
and Stop; do not bypass hook trust. Run the plugin's setup skill when available.
After restart and trust review, verify recall in a new chat. Ask me for a
non-sensitive test fact before testing storage, and verify the resulting record.
Verify the stop reminder in a separate turn with successful recall and no
successful explicit store.
Report the installed version, checks actually performed, and any remaining
user actions. Do not claim hooks or end-to-end behavior work before checking them.
```

A native Codex memory plugin: recall on user input, store on explicit request,
and remind the agent to save new findings before stopping. Reuses Respire (`rsrs`)
for retrieval, encryption, storage, accounts, and synchronization.

## Install

Requires Node.js **24+**, npm, Git, a local Codex client with plugins/hooks support,
and an installed `rsrs` CLI. On Windows, npm/pnpm rsrs wrappers also require
**PowerShell 7.3+** (`pwsh`) to preserve arguments such as double quotes.
Alternatively, set `RESPIRE_RSRS_PATH` to a native `rsrs.exe` for direct execution.
Development was checked against Codex CLI **0.163.0**. Desktop clients need the
same plugin and hooks interfaces. Work Cloud, web clients, other versions, and
enterprise environments with hooks disabled have not been validated.

This package uses `.codex-plugin/plugin.json` for Codex 0.163.0 compatibility.
That version skips hooks from root Agent Plugins `plugin.json` manifests, even
when the plugin is enabled. Do not add a root `plugin.json` alongside the
compatibility manifest. Hooks ship in the installed plugin's `hooks/hooks.json`;
installation does not create `~/.codex/hooks.json`. Once the hooks are trusted,
`SessionStart` supplies the memory instructions without a separate AGENTS.md block.

### 1. Prepare rsrs

Skip installation if an existing engine already works:

```sh
npm install -g @rsrsai/cli@latest
rsrs --version
rsrs --client-only status --json
```

Use rsrs's interactive interface to sign in, unlock the library, and configure
models. The host runtime must already be running. The plugin only invokes
`rsrs --client-only`; it does not start, stop, or upgrade services or accept passwords.

### 2. Install the Codex plugin from npm

Add this repository's marketplace, then install its `respire` entry:

```sh
codex plugin marketplace add risense-ai/respire-codex --ref main
codex plugin add respire@rsrsai
```

The repository provides the marketplace manifest. **The plugin itself downloads
from npm as `@rsrsai/codex`**, rather than a Git package dependency. The manifest
uses `latest`. To pin a version, use this entry in your own marketplace:

```json
{
  "name": "respire",
  "source": {
    "source": "npm",
    "package": "@rsrsai/codex",
    "version": "0.1.1",
    "registry": "https://registry.npmjs.org"
  },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

Place this object in the marketplace's `plugins` array. Running
`npm install -g @rsrsai/codex` alone does not register a Codex plugin. The package
includes its runtime files, has no runtime dependencies, and needs no install scripts.

### 3. Review hooks and enable the plugin

Restart Codex and confirm that Respire is enabled in the plugin interface.
Open hook management (`/hooks` in the CLI), then review and trust the plugin's
`SessionStart`, `UserPromptSubmit`, and `Stop` hooks. New or changed hooks after
installation or an upgrade still require user review; this cannot be bypassed.
Run the setup skill to check the environment. In a new conversation, test recall
for a known project and test storage with a fact explicitly approved for saving.

The plugin does not remove existing AGENTS.md instructions written by
`rsrs inject` or other memory hooks. If several sources perform automatic recall
or stop reminders, review their roles and choose which to keep to avoid duplicates.

## Usage and behavior

| Trigger | Result |
| --- | --- |
| SessionStart after startup, resume, clear, fork, or compaction | Inject memory workflow rules and check engine status |
| Ordinary user input | Synchronous `recall --titles --json`, at most 5 titles and 1500 characters; read bodies as needed |
| `记：`, `存：`, `记录：`, `记住：`, `remember:` | Attempt `remember` once and return a success, pending, or unconfirmed receipt |
| `/nomem` or `#nomem` followed by whitespace | Skip automatic recall for that input; library mode is unchanged and stop checks may still run |
| Stop | At most one continuation reminder for a turn with successful recall; successful explicit storage suppresses it |

Memory titles are reference data, not instructions. Read the complete
`rsrs --client-only prompt` policy as needed. Initial explicit storage uses a
tentative title and `important`; it does not force a parent or bypass deduplication.
`pending` means **not written**: read candidates and decide whether to update,
merge, or attach to a parent. A missing valid success ID, timeout, or cancellation
is **unconfirmed**: the write may have committed, so check the library first;
the plugin does not retry it. `plan` mode skips explicit storage. Other read-only,
pause, and permission rules are enforced by rsrs and followed by the agent.

The stop reminder asks the agent to evaluate and store new findings. It does not
automatically archive a conversation or guarantee storage. `stop_hook_active`,
session/turn deduplication, and continuation markers prevent loops. The plugin's
own continuations do not trigger recall or storage again. Subagent hooks are
not enabled. The plugin does not parse transcript files or depend on their format.

## Configuration, state, and privacy

- `RESPIRE_RSRS_PATH`: optional executable path or command name, not a shell command.
  Defaults to `rsrs`.
- `PLUGIN_ROOT` and `PLUGIN_DATA` are provided by Codex. State is not written to
  the installation directory.
- Each engine call is limited to 20 seconds and 1 MiB of stdout. Hook timeouts
  are 30/30/5 seconds respectively.
- Windows arguments travel as JSON stdin to a constant PowerShell adapter;
  user input is never interpolated into script source.
- `PLUGIN_DATA/sessions/` stores only hashed identifiers, processing stages,
  and deduplication flags, not user text, recalled titles, or passwords. Each
  session retains the latest 32 turns. Older replays may not be deduplicated;
  do not replay historical storage events.
- State updates use locks and atomic replacement. A `.lock` left by a crash
  causes subsequent recall/storage in that session to report failure and skip.
  After confirming that session's hooks have stopped, remove its lock file or
  start a new session. Clearing state loses deduplication records.
- Common credential patterns are skipped, but this is not a complete secret
  scanner. Remove sensitive content before submitting it.
- Injected titles and storage receipts enter Codex context and may reach the
  configured model provider. Local encryption does not change this.
- Raw engine stderr is not logged; only error categories are exposed. Failures
  allow the user's primary task to continue.

## Development and verification

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run verify:package
```

Tests cover real subprocess argument passing, timeout and cancellation,
concurrent storage deduplication, pending receipts, isolated state, and Stop loop
prevention. Business tests use a simulated engine and never write the developer's
real library. For local development, add the plugin directory to a local
marketplace, install into an isolated Codex configuration, and review its hooks.
A full production desktop conversation must be verified in the target client;
unit tests do not replace that check.

## CI/CD and npm publishing

GitHub Actions checks syntax, tests, and npm package contents on Windows, Linux,
and macOS. Pushing a `v*` tag runs the same checks, publishes to npm through OIDC
with provenance, and creates a GitHub Release containing the `.tgz` and
`SHA256SUMS`. Prereleases use npm `next`; stable releases use `latest`.
The tag version must match `package.json` and `.codex-plugin/plugin.json`.

An npm organization maintainer must authenticate for the first package publish.
Then add a Trusted Publisher in the npm package settings:

| Field | Value |
| --- | --- |
| Organization or user | `risense-ai` |
| Repository | `respire-codex` |
| Workflow filename | `release.yml` |
| Environment | Leave blank |
| Allowed actions | Allow `npm publish` |

No repository `NPM_TOKEN` is needed. A workflow file alone does not establish
npm-side trust; complete these settings and verify an actual release.
Plugins containing hooks are currently unsuitable for OpenAI's public plugin
directory; distribution uses a manually installed marketplace.

Interface references: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
and [Codex hooks](https://learn.chatgpt.com/docs/hooks).
