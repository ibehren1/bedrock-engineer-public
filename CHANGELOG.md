# Update summary

Dated list of changes made in this fork of [aws-samples/bedrock-engineer](https://github.com/aws-samples/bedrock-engineer).
Newest first. The topmost dated section is published as the release notes for each build, so add a
dated section here for anything user-visible.

See the [README](./README.md#whats-different-in-this-fork) for a feature-by-feature
overview of the fork with screenshots.

### 2026-08-31
- Call the action on built-in agents "Hide" instead of "Remove", and "Unhide" instead of "Restore default agents". Nothing is deleted — a hidden built-in agent is only taken out of the lists, and unhiding brings back its original configuration (any edits you made to it before hiding are not kept). Agents you created yourself are still deleted outright, and still say "Delete".
- Unhide agents one at a time. The button that brought every hidden agent back at once is now a dropdown that lists each hidden agent by name and icon, with "Unhide all" still available at the bottom.
- Allow hiding the Diagram Generator agent, which previously offered no way to remove it. The Diagram Generator page keeps working after you hide it, web search included, because it now falls back to the built-in agent configuration.
- Cut idle power use so the app is easier on a laptop battery. The largest saving: a hidden window was created at every launch to keep the background agent Task History screen warm, which meant a second full app process ran for the whole session even if you never used background agents. Task History now opens when you ask for it and is discarded when you close it, and scheduled background agent tasks are started directly instead of relying on that hidden window, so they still run after a restart without opening the page.
- Stop polling for TODO list changes when nothing can change them. The check now runs while a response is being generated, or while the TODO panel is open, instead of every two seconds for any conversation that has messages.
- Release the microphone when you leave voice chat. Previously the mic stream and audio processing kept running after navigating away mid-recording, so the system microphone indicator stayed on.
- Remove animations that ran forever with nothing happening: the gradient on the Act/Plan button in the message bar, and the rotating rings on the voice chat icon while it is idle. Loading and "Thinking" animations are unchanged.
- Check Docker availability once when the Code Interpreter settings are opened rather than every 30 seconds; the "re-check" button covers starting Docker afterwards.
- Reorganize Settings into five tabs — General, AWS, Models, Chat and Workspace — with a sidebar down the left, instead of one long column of sixteen unrelated sections. Everything that was there is still there, grouped with what it relates to: region now sits next to the credentials that use it and next to region failover, and model choice sits with the inference parameters and the light processing model. Each tab has its own address, so links into settings land on the right tab — the "Open Settings" prompt shown when voice chat isn't available in your region now opens the AWS tab directly.
- Translate the AWS and Language settings into Japanese. Those labels had no translation at all and showed in English regardless of the selected language.

### 2026-08-28
- Add a "My Agents" page with its own sidebar button (renamed from "Custom Agents"). It opens in the main window instead of an overlay, and is where you create, edit, duplicate, share, and remove agents.
- Replace the agent display button with a real agent dropdown, moved into the message entry area to the left of the model selector. The dropdown includes an "Edit agents" entry that opens the My Agents page.
- Label the message entry controls: Agent, Model, and Thinking.
- Rearrange agents by drag and drop on the My Agents page (card or table view). The arrangement is saved and is also used by the agent dropdown and `@` mentions. Dragging is disabled while a table column sort is active.
- Allow removing default agents you don't use. Removals persist across restarts (they are no longer re-seeded at startup) and can be undone with "Restore default agents" on the My Agents page. Default agents that back other pages (Website Generator, Diagram Generator) stay in place.
- Remove the agent settings overlay; the page and the dropdown replace it everywhere (chat, voice chat, and the background agent task form).
- Point the sidebar GitHub icon and the Help > GitHub Repository menu item at this fork (`ibehren1/bedrock-engineer-public`). Agent Directory contribution links still point upstream, since agent contributions go there.
- Rework the README: add a "What's different in this fork" section with current screenshots, point the download badges at this fork's releases, and correct the settings path (`Behrens AI`) and the stale agent screenshots.
- Move this dated update summary out of the README into `CHANGELOG.md`, and build release notes from that file instead of scraping the README. Each release now shows only the newest dated section plus a link to the full changelog.
- Document in `CLAUDE.md` that every commit changing user-visible behavior has to update this changelog in the same commit, so releases always carry accurate notes.
- Fix structured output (MCP server suggestions, website recommendations) failing with "Internal Server Error" whenever thinking mode was on: Bedrock rejects extended thinking together with a forced tool choice, so those requests now run without thinking. Failures also report the underlying reason instead of a bare "Internal Server Error".
- Fix the My Agents list looking like the first agent was stuck selected: the blue ring marked the agent active in chat, not the one you clicked, so it never moved. The ring is gone and the "Active" badge (with a tooltip) is the only marker. Clicking a built-in or shared agent now explains why it can't be edited instead of doing nothing.
- Make "Suggest for this agent" specific: it now reads the agent's system prompt, scenarios, allowed shell commands and additional instruction (not just its name and description), every search term has to be grounded in a phrase from that configuration, and the phrase is shown next to the term. Generic words like "automation" or "devops" are rejected, and if nothing in the agent names a system to connect to, the panel says so instead of guessing. Results are capped at 20 so the list stays scannable. Also adds an MCP Registry link next to the MCP Market one.
- Add a "Find MCP servers" panel to an agent's MCP Servers tab, backed by the official MCP Registry (registry.modelcontextprotocol.io). Search it directly, or press "Suggest for this agent" to have the model derive search terms from the agent's description, system prompt and enabled tools. Results carry real names, versions, package identifiers, required environment variables and hosted endpoints; "Load config" fills the JSON editor with a version-pinned command (or remote URL) so you review it before adding. The model only produces search terms, never package names. MCP Market is linked for browsing by category — it publishes no API and challenges automated requests, so the app doesn't read it.
- Choose an agent icon from about 38,000 icons instead of the previous 250. The icon picker keeps the curated, categorised list as its default view and adds ten icon collections you can browse or search by name: Tabler, Lucide, Phosphor, Material, Heroicons, Bootstrap, Font Awesome (plus brands), Simple Icons and Game Icons. Pick "All libraries" to search across every collection at once. Icon data loads only when you open a collection, so startup is unaffected, and existing agent icons keep working.

### 2026-08-27
- Add ability for user to specify that the agent use another agent profile (via @<profile name>) to accomplish a task.  Results come back to the current agent.  i.e. use @email to find email from Kevin and compose a reply.  This allows the current agent to use the results of another agent's task (tools) without needing to switch back and forth.

### 2026-08-24
- Add an "Export chat to PDF" button. Same content as the Markdown export in a single self-contained PDF (Letter, 1" margins), typeset like the Word export.
- Write each avatar image once instead of once per turn (`user-avatar.png`, `assistant-avatar-<model ID>.png`).
- Group consecutive turns from the same party under a single heading.
- Word: Calibri, 10pt body, 18/16/14pt Heading 1/2/3, 1" margins, and half the space above each heading.
- Word: code blocks in 8pt Courier New, with line breaks and indentation preserved.
- Word: tighter table spacing — a one-line row is about half as tall as before.
- Diagrams (Mermaid/DrawIO) render at half size; Word also centers them.

### 2026-08-20
- Add username along side the avatar.
- Add a floating toolbar to copy just the highlighted text of a chat message as markdown or rich text.
- Make the stop-generation button red while inference is running.
- Make the new-chat button green.
- Add an "Export chat to Word (.docx)" button. Exports rich text (excluding ToolUse/ToolResult like the Markdown export), labels each turn as "Assistant – <model ID>" / "User – <username>", and embeds the user/assistant avatars as images.
- Markdown export now also embeds the avatar images and uses the "Assistant – <model ID>" / "User – <username>" headings.
- Publish the GitHub release even when the build job fails or produces no installers (notes-only release; any binaries that did build are still attached).

### 2026-08-19
- Serve OpenAI GPT-5.6 (Sol/Terra/Luna) models through the standard Bedrock Converse API and remove the OpenAI Responses API translation layer.
- Remove the GPT-5.5 and GPT-5.4 models, which are not available through Converse.
- Update the release workflow to keep build artifacts only for the most current release.

### 2026-08-14
- Update assistant icon in chat interface to match the model's icon.
- Hovering over the model icon in the chat interface now displays the specific model's name that produced the output.
- Add options to copy message to clipboard in either markdown or rich text format.

### 2026-08-13
- Update Claude Sonnet 5 pricing to $2/$10 per million input/output tokens.
- Update to address open security vulnerabilities.

### 2026-08-04
- Update OpenAI model pricing. 
- Address new Dependabot security alerts.

### 2026-07-30
- Fix timezone issues for scheduled tasks.
- Create select/delete function for chat history.
- Address Dependabot security alerts.

### 2026-07-28
- Add support for OpenAI API / GPT-5.6 models..

### 2026-07-27
- Visual updates to add Dim and Dark themes.

### 2026-07-24
- Added support for Opus 5 model.

### 2026-07-23
- Remove gloss/glare from app icon.
- Add option in settings to allowlist models.
  - This to shrink the list of models shown in the model selection dropdown in the chat interface.
  - Simplfication for less technical users.
- Updated pricing and display costs of models in the chat interface dropdown.
- Allow users to pick an avatar from a picker for display in the chat interface.
- Removed prompt routers from model selection since they do not support modern models.
- Added support for Kimi 2.5 model.

### 2026-07-22
- Add setting to hide various route shortcuts from the sidebar.
- Update to name the app from productName in package.json.
- Update icon for the app.
- Update the agent chat assistant icon to the Bedrock logo.

### 2026-07-21
- Add drag-and-drop support for file attachments.
- Update versioning scheme to use date-based versioning from the last git commit.

### 2026-07-13
- Add conversation cost to the top right of the display.
- Update the ToDo list icon to flash as items change status.

### 2026-07-08
- Fix non-working Nova Sonic voice chat.
- Force chat naming at second user prompt.
- Update clear chat icon to a new-conversation icon.

### 2026-06-30
- Add Sonnet 5 model support.

### 2026-06-29
- Replace the unconditional auto-scroll-to-bottom with a hook that follows streaming output through the tool-use phase, then stops once the first line of the main response reaches the top of the message area. Respects manual scroll-up (pauses until the user returns to the bottom).
- Fix issue with title generation for chats.
- Add function to export chat history as a markdown file.
- Update to Electron 42.x.x.

### 2026-06-10
- Add support for Anthropic Fable 5 model.

### 2026-06-01
- Added Makefile targets for easy local building, installing, signing, and cleaning the project.
  - `make build-mac`: Build the project for macOS.
  - `make install`: Install the project.
  - `make sign`: Sign the project.
- Add Claude Opus 4.8 to model registry with global/JP/US inference profiles
- Add adaptive thinking mode for newer models (Sonnet 4.6, Opus 4.6/4.7/4.8) that use type: 'adaptive' without budget_tokens, while older models keep type: 'enabled' with budget_tokens
- Auto-translate thinking type in converse service based on model capabilities to prevent 400 errors when switching between model generations
- Fix Opus 4.7 supportsThinking (was incorrectly set to false)
- Remove duplicate Amazon Nova Premier entry from model registry
- Add date-based versioning via Makefile (YYYY.MMDD.N format)
- Add CLAUDE.md for codebase documentation
