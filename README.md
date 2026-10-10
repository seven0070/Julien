# Julien — your personal agent

A local-first personal-agent prototype with eleven integrated layers:

- **Chat:** dedicated assistant threads, saved conversation history, and a one-click new chat.
- **Voice:** speak through the browser’s Web Speech API where supported, and listen to replies with device speech synthesis.
- **Memory:** save, search, categorize, and remove details you choose to keep.
- **Hands:** add local reminders and planning blocks, prepare email drafts, and run a 25-minute focus timer—with visible, bounded actions.
- **Evolution:** rate replies, approve repeated preference proposals, and teach reusable shortcuts from existing local actions.
- **Skill Library & Marketplace:** install curated local-action skills, publish/export JSON manifests, or import public manifests from GitHub and review updates manually.
- **Classifier:** a lightweight in-bundle multinomial Naive Bayes router with confidence, timing, and explicit-command gates for actions.
- **Connections:** a 50-app catalog and local setup-priority list spanning productivity, communication, work, developer, storage, personal, and AI tools.
- **Model Router:** configure API and local model profiles, route task types with local-only handling for private work, preview the selected route, and import/export a portable JSON config. An explicit chat request such as “create a model router” opens the builder.
- **MCP & plugins:** save STDIO/Streamable HTTP MCP profiles, import/export host config, and create permission-scoped declarative plugin manifests without executing arbitrary code.
- **Soul:** a durable operating charter for identity, reasoning, task persistence, memory, evolution, and the proposed/executed/verified integrity contract.

## Julien’s soul

The Soul page records the stable purpose and principles that should persist when models, tools, or environments change. Its integrity contract distinguishes **proposed**, **executed**, and **verified**. Chat action receipts move to “verified” only after the corresponding local state is observed; older receipts without evidence remain unverified. In this front-end prototype, verification is limited to local browser state; durable autonomous multi-step execution is an intended direction, not a capability this build claims.

## Model router scope

The Model Router is a configuration builder, not a live gateway. It supports provider presets for OpenAI, Anthropic, Gemini, OpenRouter, custom API endpoints, Ollama, LM Studio, vLLM, and custom local endpoints. The requested Hugging Face repository for `lukey03/Qwen3.5-9B-abliterated` is included as a local-model preset and is the primary target for otherwise-unassigned routes by default. Configure general, fast, reasoning, and private/sensitive routes; the private route rejects API profiles and never falls back to an API. Endpoint/model identifiers and environment-variable names are saved locally. There is no API-key-value field; only an environment-variable reference is collected. Remote API endpoints require HTTPS; endpoint credentials, query parameters, and fragments are rejected.

No endpoint is pinged, no model ID is tested, no environment variable is read, and chat messages are not forwarded to a model. The Qwen preset records the supplied Hugging Face page as source metadata and uses `http://localhost:8000/v1` as an editable OpenAI-compatible local-server placeholder; Julien does not download or verify the weights. A trusted agent backend must load a compatible model artifact, serve it at the configured endpoint, and consume the exported routes; Julien does not synchronize the configuration to a backend. In particular, a hosted browser must not call a user’s `localhost` or private network directly. Creating or exporting a router does not require an API key, but the future runtime will need credentials before it can call an API provider.

## Run it

```sh
npm install
npm run dev
```

Vite serves the app on `http://localhost:5173` (bound to `0.0.0.0` for preview environments). Run `npm run build` for a production build and `npm test` for classifier, Soul, skill, MCP/plugin, and model-router config tests.

## What this prototype does—and doesn’t do

This version deliberately has no server, live model API, or authenticated third-party accounts. The Model Router stores profiles and displays route previews only; no provider or local inference calls are made. Public GitHub skill imports and manual update checks use the unauthenticated GitHub API for a single JSON manifest; there is no background sync. Intent routing uses a local multinomial Naive Bayes classifier with explicit phrase gates for actions; supported responses and actions remain local and rule-based. The Connections catalog saves local setup priorities only—live OAuth requires provider adapters and a secure backend. MCP & Plugins saves server profiles and permission-scoped manifest metadata; a trusted desktop host is required to launch MCP servers or execute tools, and Julien itself does not run uploaded plugin code. Julien can adapt supported reply templates from approved preferences and run shortcuts you teach it; it does not rewrite its code or execute arbitrary tools. Memories, reminders, plans, drafts, feedback, skills, learning preferences, settings, conversation threads, connection priorities, MCP profiles, plugin manifests, and model-router profiles/config are stored in this browser’s `localStorage`; MCP/model-router environment-variable names may be saved but their secret values are never stored. The focus timer runs in the open page. Reminder entries do not trigger push notifications, planning blocks are not synced to a calendar, and email drafts are never sent. Voice input depends on browser support and microphone permission; voice output uses the device’s speech synthesis.

## Publishing and installing skills

A GitHub skill is a public JSON file (for example, `skills/focus-sprint.json`) using this declarative format:

```json
{
  "format": "julien-skill/v1",
  "id": "focus-sprint",
  "name": "Focus Sprint",
  "version": "1.0.0",
  "description": "Start a quiet work session.",
  "author": "Example author",
  "license": "MIT",
  "category": "focus",
  "trigger": "focus sprint",
  "action": { "type": "focus", "text": "" }
}
```

Use the Skill Library’s **GitHub** action with a public repository URL and manifest path, or paste a direct GitHub blob/raw file URL. Julien fetches the single JSON file through `api.github.com` without a token. Installed GitHub skills keep their repository, ref, path, and commit SHA; **Check updates** fetches again and asks for approval before applying changes. Export any library skill as a manifest to publish it. Marketplace and GitHub packages can only map to the existing local reminder, memory, or focus actions; scripts and executable fields are never installed.

The Settings page lets you export the stored data as JSON or clear the local workspace. The app is a front-end prototype, not a secure vault—avoid storing sensitive information in a shared browser profile.
