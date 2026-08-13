# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Bedrock Engineer is an Electron desktop app (Mac/Windows/Linux) that provides autonomous AI agent capabilities powered by Amazon Bedrock. It supports chat with tool use, voice chat (Nova Sonic), website generation, diagram generation, Step Functions generation, background agents, and an agent directory system.

## Build & Dev Commands

```bash
npm ci                    # Install dependencies
npm run dev               # Run in development mode (electron-vite dev)
npm run build:mac         # Build for macOS (universal)
npm run build:win         # Build for Windows
npm run build:linux       # Build for Linux

npm run typecheck         # Run both node and web typechecks
npm run lint              # ESLint
npm run lint:fix          # ESLint with auto-fix
npm run format            # Prettier

npm test                  # Unit tests (excludes *.integration.test.ts)
npm run test:watch        # Unit tests in watch mode
npx jest path/to/file.test.ts              # Run a single test file
npm run test:integration                    # Integration tests (requires AWS creds + .env)
npm run test:integration:watch             # Integration tests in watch mode
```

## Architecture

This is an **Electron + React + TypeScript** app built with `electron-vite`. The three Electron layers live under `src/`:

### Main Process (`src/main/`)
- `index.ts` — App lifecycle, window creation, proxy config, IPC handler registration
- `api/bedrock/` — `BedrockService` facade with sub-services: converse, image, video, agent, flow, guardrail, translate, inference profiles, structured output
- `api/bedrock/client.ts` — AWS SDK client factories (supports both IAM credentials and named profiles)
- `api/sonic/` — Nova Sonic bidirectional streaming (voice chat)
- `handlers/` — IPC handlers registered via `registerIpcHandlers()`: bedrock, file, pdf, docx, window, agent, util, screen, camera, proxy, background-agent, pubsub, todo, mcp
- `mcp/` — MCP (Model Context Protocol) client management
- `services/strandsAgentsConverter/` — Strands agent format conversion
- `store/` — Electron-store persistence

### Preload (`src/preload/`)
- Exposes APIs to renderer via `contextBridge`: `api`, `store`, `file`, `chatHistory`, `appWindow`, `ipc`, `logger`, `preloadTools`
- `tools/` — Tool execution system with a `ToolRegistry` pattern:
  - `base/` — `BaseTool` abstract class, error types
  - `handlers/` — Tool implementations organized by category: `filesystem/`, `web/`, `bedrock/`, `command/`, `interpreter/`, `system/`, `thinking/`, `todo/`, `mcp/`
  - `registry.ts` — Registers all tools, dispatches by name

### Renderer (`src/renderer/src/`)
- React 18 + React Router (hash router) + Tailwind CSS + Flowbite React
- `contexts/` — `SettingsContext` (AWS creds, model, agents, tools), `ChatHistoryContext`, `AgentDirectoryContext`, `WebsiteGeneratorContext`
- `pages/` — ChatPage, SpeakPage (voice), WebsiteGeneratorPage, DiagramGeneratorPage, StepFunctionsGeneratorPage, AgentDirectoryPage, BackgroundAgentPage, SettingPage
- `i18n/` — English (`en.ts`) and Japanese (`ja.ts`) translations
- Path aliases: `@renderer` → `src/renderer/src`, `@` → `src/`, `@common` → `src/common`

### Common (`src/common/`)
- `models/` — Model definitions, pricing, prompt cache config (shared between main/renderer)
- `agents/` — Tool description provider, tool rule generator
- `mcp/` — MCP schemas and utilities
- `logger/` — Winston-based logging with categories and daily rotation
- `utils/` — Shared utilities (placeholder replacement, etc.)
- `validation/` — Shared validation logic

### Types (`src/types/`)
- `agent-chat.ts` / `agent-chat.schema.ts` — Core types for agents, tools, MCP config (Zod schemas)
- `tools.ts` — Built-in tool name union type and tool-related types
- `llm.ts` — Model IDs, regions, inference parameters, thinking mode

## Key Patterns

- **IPC communication**: Main process registers handlers in `src/main/handlers/`; preload exposes them via `contextBridge`; renderer calls `window.api.*` or `window.store.*`
- **Tool system**: Each tool extends `BaseTool`, is registered in `ToolRegistry` by category. Tool execution flows: renderer → preload `executeTool()` → appropriate handler. Main process can also invoke preload tools via `preload-tool-request` IPC.
- **Agent configuration**: Agents are YAML files (`.bedrock-engineer/agents/`) with system prompts, tool selections, and scenarios. Custom agents are stored in electron-store.
- **AWS credentials**: Supports both access key/secret and named AWS profiles (`fromIni`). Region and profile are stored in electron-store at key `aws`.
- **MCP integration**: MCP servers are configured per-agent with support for both command (stdio) and URL (SSE/streamable HTTP) connection types.
- **Express API server**: An internal Express server (`src/main/api/index.ts`) with Socket.IO runs on a random port for streaming communication between main and renderer.

## Testing

- Unit tests: `*.test.ts` (excluded: `*.integration.test.ts`)
- Integration tests: `*.integration.test.ts` — require real AWS credentials configured in `.env` (see `jest.integration.setup.js`)
- Test config uses `tsconfig.test.json`

## Development Agent

The project includes a pre-configured development agent at `.bedrock-engineer/agents/developer-for-bedrock-engineer.yaml` recommended for use during development.
