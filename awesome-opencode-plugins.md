# Awesome OpenCode Plugins

Source: https://github.com/awesome-opencode/awesome-opencode
Total plugins: 126

---

## 1. @bluelovers/opencode-arise

**「⚔️ ARISE!」　A Solo Leveling themed orchestrator harness for OpenCode**

A lightweight, token-efficient orchestrator layer. Enables parallel background task execution in OpenCode. Launch AI agents to work simultaneously on exploration and research while continuing with other tasks. Allows specifying custom models for each\_agent via configuration.

Repository: https://github.com/bluelovers/opencode-arise

---

## 2. aerovato/opencode-quotes-plugin

**Display inspirational quotes instead of tips**

Replaces the default home-page tips with inspirational quotes for a more motivating OpenCode experience.

Repository: https://github.com/aerovato/opencode-quotes-plugin

---

## 3. Agent Identity

**Agent self-identity and per-message attribution for multi-agent sessions**

Two plugins that improve agent identity awareness. AgentSelfIdentityPlugin injects a one-liner into the system prompt so the model knows which agent it's operating as. AgentAttributionToolPlugin exposes a tool for querying per-message agent attribution via the SDK, useful for agents that review multi-agent sessions.

Repository: https://github.com/gotgenes/opencode-agent-identity

---

## 4. Agent Memory

**Letta-inspired memory**

Gives the agent persistent, self-editable memory blocks inspired by Letta agents.

Repository: https://github.com/joshuadavidthomas/opencode-agent-memory

---

## 5. Agent Skills (JDT)

**Dynamic skills loader**

Dynamic skills loader that discovers skills from project, user, and plugin directories.

Repository: https://github.com/joshuadavidthomas/opencode-agent-skills

---

## 6. Antigravity Auth

**Google Antigravity models**

Use Gemini and Anthropic models for free via Google Antigravity IDE authentication.

Repository: https://github.com/NoeFabris/opencode-antigravity-auth

---

## 7. Antigravity Multi-Auth

**Multiple Google accounts**

Fork of opencode-antigravity-auth that allows using multiple Google accounts with automatic rotation when rate limited.

Repository: https://github.com/theblazehen/opencode-antigravity-multi-auth

---

## 8. Autotitle

**AI-powered automatic session naming**

Two-phase session titling - instant keyword titles on user message, refined AI titles after response. Auto-selects cheapest model (flash/haiku/fast), respects custom titles, zero configuration needed.

Repository: https://github.com/pawelma/opencode-autotitle

---

## 9. Background

**Background process management**

Background process management plugin for opencode.

Repository: https://github.com/zenobi-us/opencode-background

---

## 10. Background Agents

**Async agent delegation**

Claude Code-style background agents with async delegation and context persistence.

Repository: https://github.com/kdcokenny/opencode-background-agents

---

## 11. Beads Plugin

**Beads issue tracker integration**

Integration for Steve Yegge's beads issue tracker with /bd-\* commands.

Repository: https://github.com/joshuadavidthomas/opencode-beads

---

## 12. BRHP

**Persistent planning state**

Structured, persistent planning for OpenCode with local session state, /brhp commands, bounded planner history, and a TUI sidebar.

Repository: https://github.com/ZanzyTHEbar/brhp

---

## 13. CC Safety Net

**Safety net catching destructive commands**

A Claude Code plugin that acts as a safety net, catching destructive git and filesystem commands before they execute.

Repository: https://github.com/kenryu42/claude-code-safety-net

---

## 14. Claude Code Switch (CCS) OpenCode Sync

**Claude Code Switch (CCS) to OpenCode sync**

An OpenCode plugin that reads your Claude Code Switch (CCS) configuration and automatically syncs the providers into your OpenCode config.

Repository: https://github.com/JasonLandbridge/opencode-ccs-sync

---

## 15. Command Inject

**Auto-inject project commands into OpenCode**

Automatically discovers and injects Makefile targets, npm/pnpm/yarn/bun scripts, and local skills at startup. Type / to see and run all project commands.

Repository: https://github.com/shihyuho/opencode-command-inject

---

## 16. Context Analysis

**Token usage analysis**

An opencode plugin that provides detailed token usage analysis for your AI sessions.

Repository: https://github.com/IgorWarzocha/Opencode-Context-Analysis-Plugin

---

## 17. CrewBee

**Task-specific Agent Teams for OpenCode**

CrewBee is an independent Agent Team framework for OpenCode. It lets users define reusable task/project-specific Agent Teams, project them into OpenCode agents, and switch between single-agent execution and multi-agent collaboration based on task complexity. It also includes built-in Team templates such as a Coding Team with review flow and completion criteria.

Repository: https://github.com/CrewBeeLab/CrewBee

---

## 18. Devcontainers

**Multi-branch devcontainers**

Plugin for running multiple devcontainer instances with auto-assigned ports and branch-based isolation.

Repository: https://github.com/athal7/opencode-devcontainers

---

## 19. Direnv

**Load direnv variables**

Automatically loads direnv environment variables at session start. Perfect for Nix flakes.

Repository: https://github.com/simonwjackson/opencode-direnv

---

## 20. Dodo Payments

**Payments, subscriptions, webhooks, and billing for OpenCode agents**

Official Dodo Payments plugin for OpenCode (also Claude Code, Codex, Cursor). Bundles eight integration skills (checkout, subscriptions, webhooks, usage-based billing, credits, license keys, BillingSDK, best practices) plus two MCP servers — a live API server with browser OAuth and a documentation search server. Distributed via npm as @dodopayments/opencode-plugin.

Repository: https://github.com/dodopayments/dodo-agent-plugin

---

## 21. Dynamic Context Pruning

**Optimize token usage**

Plugin that optimises token usage by pruning obsolete tool outputs from conversation context.

Repository: https://github.com/Tarquinen/opencode-dynamic-context-pruning

---

## 22. Ejentum

**MCP server with reasoning, code, anti-deception, and memory tools for AI agents**

MCP server with four tools (harness\_reasoning, harness\_code, harness\_anti\_deception, harness\_memory) that AI agents can call on demand. Each tool returns a structured prompt the calling agent ingests before generating.

Repository: https://github.com/ejentum/ejentum-mcp

---

## 23. Envsitter Guard

**Prevent .env leaks**

OpenCode plugin that prevents agents/tools from reading or editing sensitive .env\* files, while still allowing safe inspection via EnvSitter (keys + deterministic fingerprints; never values).

Repository: https://github.com/boxpositron/envsitter-guard

---

## 24. FlowDeck

**AI-powered multi-agent workflow orchestration with built-in safety intelligence**

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 25 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state that survives session restarts. Key features: -   25 specialist agents (architect, planner, coder, reviewer, tester, debugger, risk-analyst, policy-enforcer, and more) -   24 reusable workflow skills (TDD, security scan, deploy check, code review, and more) -   17 workflow commands for all project operations -   15 pre-built orchestration flows including Spec-Driven Development (SDD) -   Persistent state via `.planning/STATE.md` — resume exactly where you left off -   Wave-based parallel execution for independent tasks -   AI Safety layer: patch trust scoring, edit gates, phase gating, arch constraint enforcement, failure replay, and regression prediction -   Deep System Hooks: context monitoring, session idle summaries, shell environment injection -   Built-in MCPs: Context7 (docs), Exa (web search), Grep.app (code search) -   Ensemble Reasoning via `/fd-council` for synthesized consensus from multiple agents -   Persistent Memory with SQLite for tool executions and session summaries

Repository: https://github.com/DVNghiem/FlowDeck

---

## 25. Froggy

**Hooks and specialized agents**

Plugin providing Claude Code-style hooks, specialized agents, and tools like gitingest.

Repository: https://github.com/smartfrog/opencode-froggy

---

## 26. Gemini Auth

**Google account auth**

Authenticate the Opencode CLI with your Google account so you can use your existing Gemini plan.

Repository: https://github.com/jenslys/opencode-gemini-auth

---

## 27. GitHub Release

**Automated GitHub releases**

Create and publish GitHub releases with semantic versioning, tag management, and auto-generated release notes.

Repository: https://github.com/amestsantim/opencode-github-release

---

## 28. Google AI Search

**Query Google AI Mode (SGE)**

An opencode plugin that exposes a native tool for querying Google AI Mode (SGE).

Repository: https://github.com/IgorWarzocha/Opencode-Google-AI-Search-Plugin

---

## 29. GoopSpec

**Spec-driven development workflow**

Transforms AI-assisted coding with spec-driven workflows. Features 5-phase workflow (Plan, Research, Specify, Execute, Accept), contract gates for user confirmation, 12 specialized subagents, persistent memory system, wave-based execution with atomic commits, and deviation rules for handling unexpected situations.

Repository: https://github.com/hffmnnj/opencode-goopspec

---

## 30. GPT Imagegen

**gpt-image-2 in OpenCode — no API cost when using your ChatGPT subscription**

Brings gpt-image-2 (ChatGPT Images 2) image generation to OpenCode. When you sign into OpenCode with your ChatGPT account, generations are billed against your existing Plus / Pro / Business plan — no per-image API cost. An OpenAI API key path is also planned. Supports reference images for style guidance and edits.

Repository: https://github.com/yuji-hatakeyama/opencode-gpt-imagegen

---

## 31. Handoff

**Session handoff prompts**

Creates focused handoff prompts for continuing work in a new session.

Repository: https://github.com/joshuadavidthomas/opencode-handoff

---

## 32. Harness Memory

**Persistent project memory - 73 percent fewer tokens than CLAUDE.md, with human review**

Auto-captures evidence from tool interactions and materializes memories through a multi-gate pipeline. 4-layer activation engine selects the right memories per context. Replaces CLAUDE.md with structured, searchable, reviewable project memory. Local-first (sql.js WASM), zero cloud dependency.

Repository: https://github.com/smc2315/harness-memory

---

## 33. hiai-opencode

**Canonical 12-agent model with bundled skills, MCP, LSP, and ralph-loop**

Unified plugin shipping 10 visible agents (Bob, Coder, Strategist, Critic, Guard, Researcher, Designer, Manager, Brainstormer, Vision) plus hidden Sub and Agent Skills. Bundles MCP wiring (playwright, stitch, sequential-thinking, firecrawl, rag, mempalace, context7, websearch, grep\_app), LSP, skill materialization, and a multi-layer continuation system (todo enforcer, ralph-loop, ULTRAWORK auto-start) in one install.

Repository: https://github.com/HiAi-gg/hiai-opencode

---

## 34. Honcho

**AI-native long-term memory for OpenCode**

Give OpenCode persistent memory that survives context wipes, session restarts, and fresh chats. Honcho remembers what you're working on, durable preferences, and prior context across projects. Supports cloud and self-hosted deployments with configurable session strategies.

Repository: https://github.com/plastic-labs/opencode-honcho

---

## 35. kibi-opencode

**Repo-local, branch-scoped knowledge and traceability for OpenCode**

Plugin-first entry point into the Kibi stack for OpenCode users. It adds context-aware guidance, routes durable code comments toward Kibi artifacts, runs non-blocking background sync and targeted validation checks, and helps keep repo knowledge branch-local and queryable. ``` <br><br>

Repository: https://github.com/Looted/kibi

---

## 36. Kilo Gateway Auth

**Kilo Gateway provider**

Adds Kilo Gateway provider support to OpenCode.

Repository: https://github.com/JungHoonGhae/opencode-kilo-auth

---

## 37. Lemma

**Persistent memory layer for LLMs via MCP - local, zero-dependency, works on all clients**

Biological memory model for AI coding agents. Features confidence decay/boost, Fuse.js fuzzy dedup, guide system with usage tracking, cross-references, cumulative backup, virtual session tracking, and universal memory injection via tool descriptions (works on Claude Desktop, Cursor, VS Code, Gemini CLI, opencode, and any MCP client). No API keys, no cloud, fully local JSONL storage. 20 MCP tools, 110 tests, MIT licensed. ``` <br><br>

Repository: https://github.com/xenitV1/lemma

---

## 38. Magic Context

**Lossless context management with background compression**

Cache-aware context management that keeps long sessions productive. Background historian compresses old conversation into structured compartments while you keep working. Includes cross-session project memory, unified search across history/memories/facts, overnight dreamer for memory maintenance, and prompt-cache-safe deferred operations.

Repository: https://github.com/cortexkit/opencode-magic-context

---

## 39. Manage Skills

**Wizard-driven skills management for OpenCode.**

Modal-based skill install, remove, list, and update workflow that avoids ANSI prompts while wrapping the skills CLI inside OpenCode.

Repository: https://github.com/Randroids-Dojo/ManageSkills

---

## 40. Micode

**Brainstorm-Plan-Implement workflow**

Structured workflow with session continuity, subagent orchestration, git worktree isolation, and AST-aware tools.

Repository: https://github.com/vtemian/micode

---

## 41. Model Announcer

**Model self-awareness**

Automatically injects the current model name into the chat context so the LLM is self-aware.

Repository: https://github.com/ramarivera/opencode-model-announcer

---

## 42. Morph Fast Apply

**10,500+ tokens/sec code editing**

Integrates Morph's Fast Apply API for faster code editing with lazy edit markers and unified diff output.

Repository: https://github.com/JRedeker/opencode-morph-fast-apply

---

## 43. oc-mnemoria

**Persistent shared memory (hive mind) for OpenCode agents across sessions**

Gives all OpenCode agents a shared persistent memory store where every agent can read and write. Each entry is tagged with the creating agent (plan, build, ask, review) so no context is lost between roles. Powered by the mnemoria Rust engine with hybrid BM25 + semantic search, CRC32 checksum chains, and an append-only binary format. Includes 7 tools and /mn-\* slash commands.

Repository: https://github.com/one-bit/oc-mnemoria

---

## 44. Oh My Opencode

**Agents & Pre-built tools**

Background agents, pre-built tools (LSP/AST/MCP), curated agents, and a Claude Code compatible layer.

Repository: https://github.com/code-yeongyu/oh-my-opencode

---

## 45. Oh My Opencode Slim

**Lightweight agent orchestration with reduced token usage**

Slimmed-down fork of oh-my-opencode focused on core agent orchestration. Features specialized sub-agents (Explorer, Oracle, Librarian, Designer, etc.), background task management, LSP/AST tools, tmux integration for live agent visibility, and MCP servers. Optimized to consume significantly fewer tokens.

Repository: https://github.com/alvinunreal/oh-my-opencode-slim

---

## 46. Omniroute Auth

**Omniroute authentication provider**

Connect and automatically fetch models from your Omniroute instance

Repository: https://github.com/Alph4d0g/opencode-omniroute-auth

---

## 47. Open Conclave

**Multi-agent debates, moderated by a captain agent until they reach consensus**

In the style of Grok 4.20, multiple agents are dispatched to answer the same query. Each one has a different system prompt (logical, creative, research-focused) and have to reach a consensus for the final output. The user can specify which provider/model they want to use and override the system prompt of each agent via config.

Repository: https://github.com/martinzokov/open-conclave

---

## 48. Open Dynamic Workflows

**Dynamic multi-agent workflows for OpenCode — plan, orchestrate, and verify with the script as the orchestrator**

An MIT-licensed engine bringing Claude-Code-style dynamic workflows and ultracode to OpenCode. A local daemon runs a generated orchestration script with concurrent agents, adversarial verification, and crash-resume; the OpenCode plugin adds workflow/ultracode triggers and a planning UI. Bring your own model — Anthropic, any OpenAI-compatible endpoint, or local Ollama.

Repository: https://github.com/Suraj1235/open-dynamic-workflows

---

## 49. open-plan-annotator

**Annotate LLM plans like a Google Doc!**

A fully local agentic coding plugin that intercepts plan mode and opens an annotation UI in your browser. Select text to strikethrough, replace, insert, or comment — then approve the plan or request changes

Repository: https://github.com/ndom91/open-plan-annotator

---

## 50. OpenAI Codex Auth

**ChatGPT Plus/Pro OAuth**

This plugin enables opencode to use OpenAI's Codex backend via ChatGPT Plus/Pro OAuth authentication.

Repository: https://github.com/numman-ali/opencode-openai-codex-auth

---

## 51. OpenCode Adaptive Thinking

**Adaptive reasoning-effort control**

OpenCode plugin that lets agents actively adjust model reasoning effort during a session, with configurable system guidance and a tool for switching between valid reasoning-effort variants.

Repository: https://github.com/ian-pascoe/opencode-adaptive-thinking

---

## 52. OpenCode Agent Tmux

**Real-time tmux panes for OpenCode agents with auto-launch, streaming, and cleanup.**

Smart tmux integration for OpenCode that auto-spawns panes to stream agent output, supports flexible layouts and multi-port setups, and cleans up when sessions finish.

Repository: https://github.com/AnganSamadder/opencode-agent-tmux

---

## 53. Opencode Agents Sidebar

**Browse configured OhMyOpenAgent agents in the TUI**

OpenCode sidebar plugin that displays configured OhMyOpenAgent agents with lifecycle-based categories, collapsible sections, descriptions, and model information.

Repository: https://github.com/Mark1708/opencode-agents-sidebar

---

## 54. Opencode Canvas

**Interactive terminal canvases in tmux splits**

Interactive terminal canvases (calendars, documents, flight booking) in tmux splits. Port of claude-canvas for OpenCode.

Repository: https://github.com/mailshieldai/opencode-canvas

---

## 55. OpenCode Chromium Browser Plugin

**Browser automation for Chromium browsers with a readable extension and native host**

OpenCode browser automation for Chromium-based browsers using a readable Manifest V3 extension, Node.js native messaging host, and OpenCode-native tools. Supports Chrome, Edge, Brave, Chromium, screenshots, CDP commands, DOM actions, downloads, console/network inspection, and controlled tab sessions.

Repository: https://github.com/DJOCKER-FACE/opencode-chromium-browser-plugin

---

## 56. OpenCode Claude Memory

**Claude Code-compatible memory**

Share persistent Markdown memory between OpenCode and Claude Code using Claude Code-compatible paths and file formats.

Repository: https://github.com/kuitos/opencode-claude-memory

---

## 57. OpenCode Ensemble

**Parallel agent teams for OpenCode**

Coordinate parallel OpenCode agents with peer messaging, a shared task board, git worktree isolation, and a live dashboard.

Repository: https://github.com/hueyexe/opencode-ensemble

---

## 58. Opencode Hooks Plugin

**Claude code compatible hooks**

Use Claude code hooks definition and hook them to opencode hooks.

Repository: https://github.com/romain325/opencode-hooks-plugin

---

## 59. Opencode Host Notify Bridge

**Devcontainer notifications bridged back to the host**

OpenCode plugin and host helper that forward permission, question, and idle notifications from devcontainers to the host machine for desktop alerts and sound.

Repository: https://github.com/Zaradacht/opencode-host-notify-bridge

---

## 60. Opencode Ignore

**Ignore files based on pattern**

Plugin to ignore directory/file based on pattern.

Repository: https://github.com/lgladysz/opencode-ignore

---

## 61. Opencode LiteLLM

**Auto-discover models from a LiteLLM proxy**

Drop-in LiteLLM provider for OpenCode with zero configuration. Auto-detects a running LiteLLM proxy on common ports (4000, 8000, 8080), pulls every model from /v1/models, and registers them in OpenCode automatically — no model lists to hand-maintain. Smart name formatting, modality categorization (chat/embedding/image/audio), provider extraction, optional API-key auth, and a 5-second timeout so a slow proxy never blocks startup. ``` <br><br>

Repository: https://github.com/yuseferi/opencode-litellm

---

## 62. Opencode Log Sanitizer

**Sanitizes pasted logs by redacting long strings, JWTs, bcrypt hashes, and base64 blobs**

Sanitizes pasted logs before sending them to AI by redacting long quoted strings, JWT tokens, bcrypt hashes, and base64 blobs to reduce token usage and remove irrelevant noise.

Repository: https://github.com/errhythm/opencode-log-sanitizer

---

## 63. Opencode Mem

**Persistent memory with vector database**

A persistent memory system for AI coding agents that enables long-term context retention across sessions using local vector database technology. Features dual memory scopes, web interface, auto-capture system, and multi-provider AI support.

Repository: https://github.com/tickernelz/opencode-mem

---

## 64. OpenCode Mission Control

**Command center for parallel agents — worktree isolation, DAG plans, merge train, PRs**

Orchestrates parallel OpenCode agents in tmux-isolated git worktrees with live inspection (capture/attach/diff), a dashboard overview, agent status reporting, and in-chat notifications. Supports DAG-based plans with autopilot/copilot/supervisor modes and a merge train with test gating and automatic rollback.

Repository: https://github.com/nigel-dev/opencode-mission-control

---

## 65. Opencode Models Discovery

**Configurable model discovery and filtering without long manual config**

OpenCode plugin for discovering models from OpenAI-compatible providers and API gateways, with provider and model filtering so users can avoid maintaining large configs or loading every model at once.

Repository: https://github.com/yuhp/opencode-models-discovery

---

## 66. Opencode Notify

**Native OS notifications**

Native OS notifications for OpenCode - know when tasks complete.

Repository: https://github.com/kdcokenny/opencode-notify

---

## 67. OpenCode ntfy.sh

**Push notifications to keep you in the know, even when you're on the go.**

An OpenCode plugin that adds push notifications through ntfy.sh.

Repository: https://github.com/lannuttia/opencode-ntfy.sh

---

## 68. OpenCode Plan Manager

**AI-Native Implementation Planning for Modern Agentic Workflows**

High-performance, minimalist plugin designed to bridge the gap between complex implementation strategies and autonomous execution. Selective context loading, zero-hallucination schemas, visible filesystem kanban.

Repository: https://github.com/yurihbm/opencode-plan-manager

---

## 69. OpenCode Provider Alias

**Alias and curate OpenCode providers with model metadata from models.dev.**

Lets users define local OpenCode provider and model aliases hydrated from existing models.dev metadata.

Repository: https://github.com/baranwang/opencode-provider-alias

---

## 70. Opencode Quota

**Quota toasts and token tracking**

Track quota and token usage across providers via automatic toasts and slash commands.

Repository: https://github.com/slkiser/opencode-quota

---

## 71. Opencode Roadmap

**Strategic planning**

Strategic roadmap planning and multi-agent coordination plugin. Provides project-wide planning capabilities.

Repository: https://github.com/IgorWarzocha/Opencode-Roadmap

---

## 72. Opencode Sessions

**Session management**

Session management plugin for OpenCode with multi-agent collaboration support.

Repository: https://github.com/malhashemi/opencode-sessions

---

## 73. Opencode Snippets

**Instant inline text expansion**

Instant inline text expansion for OpenCode. Type #snippet anywhere in your message and watch it transform. Brings DRY principles to prompt engineering with composable, shell-enabled snippets.

Repository: https://github.com/JosXa/opencode-snippets

---

## 74. OpenCode Swarm

**Verification-gated swarm with architect, review, test, and security agents**

Verification-gated OpenCode swarm with architect planning, independent review, test engineering, security checks, and resumable evidence.

Repository: https://github.com/zaxbysauce/opencode-swarm

---

## 75. Opencode Synced

**Sync configs across machines**

Enables syncing global opencode configurations across machines with public/private visibility options.

Repository: https://github.com/iHildy/opencode-synced

---

## 76. Opencode Telemetry

**Passive cross-session telemetry to local SQLite; cost rollups across agent orchestration chains**

Logs every opencode session to a local SQLite database automatically — tokens, tool calls, skills, per-turn cost. Aggregates costs across orchestration chains (conductor + child sessions), offers turn-by-turn forensic inspection, and ships an \`octm\` CLI for reports without spending model tokens. Zero cloud, zero network, no message bodies stored.

Repository: https://github.com/agostinilabsrl/opencode-telemetry

---

## 77. OpenCode Throughput

**Real-time LLM performance monitoring**

Real-time LLM performance monitoring plugin for OpenCode. Tracks TTFT, TPS, latency, token usage, and cost per model with toast notifications and a TUI sidebar display.

Repository: https://github.com/Howardzhangdqs/opencode-throughput

---

## 78. OpenCode Token Tracker

**Real-time token usage, cost, and latency tracking for every AI request in OpenCode**

Displays a toast after each AI response with input/output tokens, cache hits, reasoning tokens, response latency, per-message cost, cumulative session cost, model identifier, and request count. Automatically aggregates tokens from subagent sessions spawned via the Task tool. Zero config — drop the file in and it works.

Repository: https://github.com/eserete/opencode-token-tracker

---

## 79. Opencode TTS

**Voice summaries for idle responses**

Speaks assistant responses aloud when a session goes idle, with summary or full-text modes and local TTS backends.

Repository: https://github.com/StefanoChiodino/opencode-tts

---

## 80. Opencode update notifier

**Notify about plugin updates.**

Checks if your pinned plugins have newer versions available and shows a notification.

Repository: https://github.com/tim-hilde/opencode-update-notifier

---

## 81. Opencode Usage Monitor

**Monitor OpenAI and Z.AI usage quotas in the TUI**

OpenCode sidebar plugin that displays API usage quotas for OpenAI and Z.AI providers with per-model breakdowns, spend tracking, and configurable refresh controls.

Repository: https://github.com/Mark1708/opencode-usage-monitor

---

## 82. Opencode Visualizer

**2D pixel-art office for AI agents**

Turning raw OpenCode terminal logs into cozy 2D pixel office chaos. Watch your agents work, idle, and celebrate success in a bustling virtual office.

Repository: https://github.com/psinetron/opencode-visualiser

---

## 83. OpenCode Workaholic

**Enforce mandatory working time and prevents premature "done" responses**

\- AI has an early-exit problem: it says "done" at 30 seconds while edge cases are untested, bugs remain, and docs are missing. - Workaholic enforces mandatory working time for AI until the timer hits zero. - Blocks premature "done" responses until timer expire, and require AI to call checkout() to end the task. ``` <br><br>

Repository: https://github.com/RoderickQiu/opencode-workaholic

---

## 84. Opencode Workspace

**Multi-agent orchestration**

Bundled multi-agent orchestration harness with 16 components in one install.

Repository: https://github.com/kdcokenny/opencode-workspace

---

## 85. Opencode Worktree

**Zero-friction git worktrees**

Zero-friction git worktrees for OpenCode. Auto-spawns terminals, syncs files, cleans up on exit.

Repository: https://github.com/kdcokenny/opencode-worktree

---

## 86. opencode-ascii

**Strip unicode characters from output and replace them by their ASCII equivalents**

Substitute unicode characters for ASCII. Em-dash (—) and en-dash (–) for hyphens (-); right arrow (→) for (->) and so on.

Repository: https://github.com/d3vv3/opencode-ascii

---

## 87. opencode-bmad-workflow

**BMAD workflow plugin — automates epic, feature, sprint and code review workflows using specialized AI agents**

Brings the BMAD (Breakthrough Method of Agile AI-Driven Development) methodology to OpenCode. Provides specialized agents for product management, architecture, development, and QA roles. Automates epic planning, feature breakdown, sprint workflows, and code reviews through a structured multi-agent pipeline.

Repository: https://github.com/Alex-stack-cell/opencode-bmad-workflow

---

## 88. opencode-mystatus

**Check AI subscription quotas**

Check all your AI subscription quotas in one command. Supports OpenAI (Plus/Pro/Codex, etc.), Zhipu AI, Google Antigravity, and more.

Repository: https://github.com/vbgate/opencode-mystatus

---

## 89. opencode-personality

**A configurable personality and mood system plugin for OpenCode.**

Give your AI assistant a distinct personality with customizable moods that drift over time.

Repository: https://github.com/joostvanwollingen/opencode-personality

---

## 90. opencode-plugin-otel

**OpenTelemetry telemetry exporter for opencode sessions, mirroring Claude Code monitoring signals**

Exports metrics, logs, and traces from opencode sessions via OTLP/gRPC to any OpenTelemetry-compatible backend (Datadog, Honeycomb, Grafana Cloud, etc.). Instruments session lifecycle, token usage, cost, tool durations, and git commits — mirroring the same signals as Claude Code's monitoring.

Repository: https://github.com/DEVtheOPS/opencode-plugin-otel

---

## 91. opencode-review

**Automatic structured code review with configurable dimensions and auto-fix**

An automatic code review plugin for OpenCode CLI. Reviews staged changes when session goes idle, with configurable cooldown, multi-dimension analysis (code quality, security, performance, testing, documentation), severity levels, and auto-fix chain support.

Repository: https://github.com/sun-praise/opencode-review

---

## 92. opencode-short-term-memory

**Maintain user instructions and preferences throughout long sessions. No more repeating yourself.**

Automatically summarizes conversation context into structured session memory and injects it back into the system prompt every few turns — preserving user instructions, project context, decisions, and active references across long chats and compactions.

Repository: https://github.com/andrejtonev/opencode-short-term-memory

---

## 93. opencode-snip

**OpenCode plugin that prefixes shell commands with snip to reduce LLM token consumption by 60-90%**

Automatically prefixes supported shell commands (git, go, cargo, npm, docker, etc.) with snip to filter output before it reaches your LLM context window.

Repository: https://github.com/VincentHardouin/opencode-snip

---

## 94. OpenCodeRAG

**Local-first RAG plugin for semantic code search with tree-sitter chunking and LanceDB**

A local-first Retrieval-Augmented Generation plugin for OpenCode that enables semantic code search across your workspace. Features AST-aware chunking via tree-sitter (19 languages), incremental indexing with file-change detection, watch mode for live re-indexing, and configurable embeddings via Ollama (default) or OpenAI. Includes a CLI (index, query, status, clear) and an OpenCode plugin with a chunk retrieval tool + automatic chat.message file suggestions. All processing stays local by default — no data leaves the machine. ``` <br><br>

Repository: https://github.com/MrDoe/OpenCodeRAG

---

## 95. OpenHax Codex

**OAuth authentication**

OAuth authentication plugin for personal coding assistance with ChatGPT Plus/Pro subscriptions.

Repository: https://github.com/open-hax/codex

---

## 96. Openskills

**Alternative skills manager**

Alternative skills management plugin for opencode with enhanced features.

Repository: https://github.com/numman-ali/openskills

---

## 97. OpenSpec

**Add Architecture planning and specification agent for OpenSpec**

An OpenCode plugin that integrates OpenSpec, providing a dedicated agent for planning and specifying software architecture.

Repository: https://github.com/Octane0411/opencode-plugin-openspec

---

## 98. Optimal Model Temps

**Optimal sampling temperatures**

Minimal plugin that nudges specific models to their preferred sampling temperature.

Repository: https://github.com/Lyapsus/opencode-optimal-model-temps

---

## 99. OrgX OpenCode Plugin

**OrgX Work Graph peer for task dispatch, receipts, deviations, and passive reconciliation**

OrgX OpenCode Plugin connects OpenCode sessions to the OrgX execution control plane. It receives OrgX task dispatches, drives the user's local OpenCode session, posts execution receipts and deviations back to OrgX, and writes compact Work Graph events for later audit-first reconciliation.

Repository: https://github.com/useorgx/orgx-opencode-plugin

---

## 100. Pilot

**Automation daemon**

Automation daemon that polls for work from GitHub issues and Linear tickets.

Repository: https://github.com/athal7/opencode-pilot

---

## 101. Plannotator

**Interactive plan review UI**

Plan review UI with visual annotation, private/offline sharing, and Obsidian/Bear integration.

Repository: https://github.com/backnotprop/plannotator

---

## 102. Plugin Template

**CICD setup for plugins**

Focuses on providing the CICD setup with generator script, release please, bun publish, npm trusted publishing, and mise tasks.

Repository: https://github.com/zenobi-us/opencode-plugin-template

---

## 103. Pocket Universe

**A subagent driven pocket universe for your primary agent**

Async agents can be powerful, but orchestration is at best finicky; they fire and forget, orphan work, lose context, waste time... and tokens. This plugin extends the native opencode subagent paradigm to provide closed loop, resilient, async agents, blocking main thread execution. A "pocket universe". This ships with three tools creating a robust system for parallel subagents to communicate and coordinate work

Repository: https://github.com/spoons-and-mirrors/pocket-universe

---

## 104. PR Auto-Signature

**Automatically adds AI model signature to PRs, Issues, and Commits**

Plugin that automatically appends AI model signature to Pull Requests, Issues, and git commit messages. Supports GitHub MCP tools, git CLI, and gh CLI. Recognizes 90+ AI models including Claude, GPT, Gemini, DeepSeek, Llama, Mistral, and more.

Repository: https://github.com/arttttt/opencode-pr-signature

---

## 105. Ralph Wiggum

**Self-correcting agent loops**

Iterative AI development loops with self-correcting agents based on the Ralph Wiggum technique.

Repository: https://github.com/Th0rgal/opencode-ralph-wiggum

---

## 106. Research Papers

**Search arXiv and OpenAlex for research papers with recency and citation filtering**

OpenCode plugin that adds a research\_papers tool for searching scholarly literature. Uses arXiv for fresh preprints and OpenAlex for broader metadata, citation counts, and open-access links. Supports filtering by latest, trending, or top-cited papers.

Repository: https://github.com/saim-x/opencode-research-papers

---

## 107. Ring a Bell Example

**Simple terminal bell plugin**

A simple plugin to ring the terminal bell once a request is complete. Instructions file that teaches LLMs how to avoid interactive shell commands that hang in non-TTY environments.

Repository: https://github.com/JRedeker/opencode-shell-strategy

---

## 108. Simple Memory

**Git-based memory**

Simple plugin to manage memory inside a git repo that can be committed and reviewed by team members.

Repository: https://github.com/cnicolov/opencode-plugin-simple-memory

---

## 109. Simple Notify

**Native desktop notifications with near-zero dependencies**

Lightweight desktop notification plugin for OpenCode. Sends native OS notifications via dbus (Linux) and osascript (macOS) when sessions complete, error, need approval, or wait for input. Shows project name, elapsed time, and message preview.

Repository: https://github.com/Yusuzhan/opencode-simple-notify

---

## 110. Smart Title

**Auto-generate session titles**

Auto-generates meaningful session titles using AI.

Repository: https://github.com/Tarquinen/opencode-smart-title

---

## 111. Smart Voice Notify

**Intelligent voice notifications**

Smart voice notification plugin with multiple TTS engines (ElevenLabs, Edge TTS, SAPI) and intelligent reminder system.

Repository: https://github.com/MasuRii/opencode-smart-voice-notify

---

## 112. Subagent Reporter

**See exactly what your subagents are up to (in the terminal) when invoked during an \`opencode run \_\_\_\_\_\` session.**

When opencode run is invoked normally, the actions of the primary agent are visible in the terminal, but subagent actions are not. This makes it difficult to follow progress on the prompt, and makes it very difficult to use \`opencode run\` as part of an unattended process or script. This plugin pipes subagent actions/events directly to stdout, prefixes them with the subagents name, and enumerates subagents when run in parallel for easy identification. This allows the user to follow along in realtime when subagents are running, and effectively trace execution at a later time.

Repository: https://github.com/raisbecka/opencode-subagent-output

---

## 113. Subtask2

**Orchestration system**

Extend opencode /commands into a powerful orchestration system with granular flow control.

Repository: https://github.com/spoons-and-mirrors/subtask2

---

## 114. Swarm Plugin

**Swarm intelligence**

Swarm plugin for opencode enabling swarm-based agent coordination.

Repository: https://github.com/joelhooks/opencode-swarm-plugin

---

## 115. System Prompt Logger

**System prompt logger**

OpenCode plugin that intercepts the system prompt before it's sent to the LLM and logs it.

Repository: https://github.com/tlinhart/opencode-system-prompt-logger

---

## 116. Token Monitor

**Token analysis & cost tracking with budgets, trends, and per-project analytics**

Track token usage (input/output/reasoning/cache), estimate costs, view daily trends with ASCII charts, set budget alerts, and export data. Supports per-agent breakdown, agent×model cross-analysis, and project-scoped analytics.

Repository: https://github.com/Ainsley0917/opencode-token-monitor

---

## 117. Tokenscope

**Token analysis & cost tracking**

Tokenscope, Comprehensive token usage analysis and cost tracking for opencode sessions.

Repository: https://github.com/ramtinJ95/opencode-tokenscope

---

## 118. toon-config

**Loads TOON based, AGENTS.toon rather than Markdown**

Use TOON based agent instructions. Command to analyize and improve agent instructions.

Repository: https://github.com/mmynsted/opencode-toon-config-plugin

---

## 119. TypeUI

**Design systems, UI prompts, and layout variation guidance**

Open-source design layer for OpenCode that provides curated design skills, UI prompts, and layout variation guidance so agents can generate more consistent interfaces. Includes an [OpenCode setup guide](https://www.typeui.sh/docs/guides/opencode).

Repository: https://github.com/bergside/typeui

---

## 120. ul-opencode-event

**Multi-channel notifications (SMTP, DingTalk, Feishu) and token usage analytics**

Get notified when OpenCode sessions complete, error, or need your attention - via SMTP email, DingTalk robot, or Feishu robot. - Multi-channel: SMTP, DingTalk, Feishu, local JSONL file - Multi-level token analytics: message / session / total / project scopes - 74+ template variables with i18n support (zh/en) - Global + project config merge, automatic DB preload for crash recovery - Built-in CLI test tool ``` <br><br> ``` A simple plugin that strips ALL emojis from agent outputs in Opencode. OpenCode-compatible Slack notifier plugin and toolkit for Codex, OpenCode, Claude Code, and Gemini workflows.

Repository: https://github.com/Wangmerlyn/vibe-coding-slack-notifier

---

## 121. WakaTime

**WakaTime integration**

WakaTime integration plugin for tracking coding activity in opencode sessions.

Repository: https://github.com/angristan/opencode-wakatime

---

## 122. Warcraft Notifications

**Fun sound notifications**

Notification plugin with Warcraft sounds for opencode completion alerts.

Repository: https://github.com/pantheon-org/opencode-warcraft-notifications

---

## 123. With Context MCP

**Project-specific markdown notes**

MCP server for managing project-specific markdown notes with templates, batch edits, and ignore patterns.

Repository: https://github.com/boxpositron/with-context-mcp

---

## 124. Worktree Memory Sync

**Auto-sync memory to git worktrees**

Automatically copies .opencode/memory/ from the main repository into new git worktrees on session init. Detects worktrees via the .git file, resolves the main repo, and syncs memory files only when the destination is empty — so it never overwrites your changes.

Repository: https://github.com/Edison-A-N/opencode-worktree-memory-sync

---

## 125. Xquik

**X/Twitter data skill & MCP server**

X/Twitter data skill — MCP server, REST API, 20 extraction tools. Works with Claude Code, Cursor, Codex, and 40+ agents.

Repository: https://github.com/Xquik-dev/x-twitter-scraper

---

## 126. Zellij Namer

**Auto-rename Zellij sessions**

Keeps your Zellij session name in sync with your work.

Repository: https://github.com/24601/opencode-zellij-namer

---
