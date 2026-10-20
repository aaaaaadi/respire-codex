---
name: setup
description: Check and troubleshoot this Respire Codex plugin's rsrs runtime, installation, and hook activation when the user installs or configures Respire.
---

Check `rsrs --version` and `rsrs --client-only status --json`. Report missing CLI,
unavailable host runtime, locked library, or missing login separately. Use the
engine's current output; don't request passwords or tokens in chat. Let the user
complete rsrs account/unlock actions interactively. Don't start or change the
runtime, install the engine, or change credentials without user authorization.

Confirm this plugin is installed and enabled. Explain that installation alone
does not trust hooks: the user must review SessionStart, UserPromptSubmit and Stop
in the Codex hooks UI (`/hooks` in the CLI). Don't bypass trust or disable other
hooks. After plugin changes, restart the client and use a new chat to verify it.

In Codex 0.163.0, zero installed hooks is a loading failure, not a trust failure.
Check that the package has `.codex-plugin/plugin.json`, no root `plugin.json`,
and `hooks/hooks.json`. That version skips hooks from Agent Plugins manifests.
Do not create a second user hooks.json to mask a broken plugin install.

Offer a recall check with a known, non-sensitive project term. An empty result is
valid and isn't proof of a broken installation. Only test storage with a fact the
user explicitly asks to save; inspect the receipt and don't retry an unconfirmed
write. Show how `记住：...` and `/nomem ...` work. Existing AGENTS.md instructions
remain in place; identify redundant memory integrations before proposing changes.

See the packaged [README](../../README.md) for npm marketplace installation,
configuration and state recovery. State precisely which checks ran. Don't claim
a model-mediated storage or reminder flow was tested from a shell-only check.
