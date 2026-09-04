# Update summary

Dated list of changes made in this fork of [aws-samples/bedrock-engineer](https://github.com/aws-samples/bedrock-engineer).
Newest first. The topmost dated section is published as the release notes for each build, so add a
dated section here for anything user-visible.

See the [README](./README.md#whats-different-in-this-fork) for a feature-by-feature
overview of the fork with screenshots.

### 2026-09-04

- On Windows, a Docker sandbox that mounts a folder from your project no longer writes that path with backslashes into its compose file. Docker Compose expects forward slashes there, so the mount could fail to resolve; sandbox paths are now always written in the form Compose understands.
- Attachments now work like sandboxes: they are files on disk in your project directory instead of text pasted into the message box. Dropping, pasting or picking a file writes it into `attachments/<chat-title>-<id>/` right away, and images are files too, so the thumbnail strip above the input is gone. A paperclip button sits next to the export buttons — always available, with a badge for how many files this chat has — and its menu lists each file with its size, deletes one on the spot, adds more through a file picker, and opens the folder in Finder, Explorer or your Linux file manager. The folder is named after the chat and is renamed automatically when the chat title changes, including when a title is generated for you.
- What the agent sees is rebuilt from the folder on every message. Edit an attached file in an editor, or remove it from the paperclip menu, and the next thing you send reflects that — no re-attaching and no rewriting of the conversation. Text, PDF and Word contents are extracted inline and images are sent as images; anything else, spreadsheets included, is listed by name and path so the agent can open it with its file tools. Very long files are trimmed with a note telling the agent to read the rest itself. Because the contents are assembled per message rather than stored, they no longer bloat the saved conversation or the Markdown, Word and PDF exports.
- Deleting a chat now deletes its attachments folder along with it, and deleting all chats clears the whole `attachments/` folder — including chats that never got as far as sending a message. The old shared `.bedrock-engineer/attachments` folder is no longer used and can be deleted by hand; files already in it are left alone.
- Add a full **User Guide** covering every page, every tool and every setting in plain language, written for someone comfortable with a computer but not deeply technical. It explains what each of the twenty-eight tools does and when to reach for it, walks through building an agent and writing a system prompt, covers attachments, Docker sandboxes, MCP servers, scheduled background tasks and the generators, and explains how to choose a model and keep costs down. It ends with a "how do I…" index of about fifty common questions, a glossary, and a troubleshooting section for the errors people actually hit. The agents in the app can read the guide themselves, so you can ask the chat how a feature works instead of going and looking it up.
- New **Help** button in the bottom-left corner, just above the GitHub link. It opens a chat called "Bedrock Engineer Help" with the user guide already attached, so you can ask how something works in plain language and get an answer taken from the guide rather than guessed at. The guide now ships inside the app, so it always matches the build you are running — no internet connection needed. The help chat runs on whichever model you picked as the **Light Processing Model** in Settings, which keeps it cheap; if you haven't picked one it uses your main conversation model. It has no tools at all, so it can only answer from the guide, and it will say so plainly when the guide does not cover what you asked. Clicking Help again returns to the same conversation instead of starting over, and the chat appears in your history like any other. If you have not set a project directory yet the guide cannot be saved as an attachment, so it is handed to the help agent directly instead and a note tells you why no attachment is shown.
- The User Guide now covers setting up AWS from nothing. A rewritten "Setting up access to Amazon Bedrock" section walks through enabling model access in the Bedrock console (including why access is per region and why cross-region models need it granted in several), attaching the IAM policy the app asks for, creating access keys in the console or with the API, installing the AWS CLI on macOS, Windows and Linux, and filling in the `~/.aws/credentials` and `~/.aws/config` files by hand or with `aws configure` — with named profiles, session tokens and IAM Identity Center covered, and a short set of commands for checking your setup works before blaming the app. Each failure those commands can produce is matched to the step that fixes it, the troubleshooting section gained entries for invalid and expired credentials, and the README points at the new section from the top, from Getting Started, from the install steps and from the documentation list.

### 2026-09-03

- Add xAI's Grok 4.6 to the model list. It is built for coding, agentic work and long-running tasks, with a 500K token context window, and its reasoning is always on — the thinking control sets how hard it thinks rather than whether it thinks at all. Bedrock offers it through two routing options, Global and US, both of which appear in the model dropdown; there is no single-region option. Grok also caches repeated prompt content automatically, so no cache settings are involved. Grok 4.3 is not offered, because Bedrock does not serve it on the API this app uses.
- The "Deeper" thinking setting now asks for the highest reasoning effort the model offers, one step up from before. This affects Grok 4.6 and the GPT-5.6 models; Claude models are unchanged.
- Switching to another chat no longer cancels the one you were in. An agent keeps working — including running its tools — while you read or write in a different chat, and the answer is there waiting when you come back. Chats still working are marked "Still responding" in the history list, and the stop button only ever stops the chat you are looking at. This also holds when you leave the Chat page entirely, so you can check settings mid-answer; reloading the window still cancels everything.
- Starting a new chat while one is answering leaves that answer running instead of throwing it away.
- Open the chat history panel by default when you go to Chat, instead of having to expand it each time.
- New **Docker Sandbox** tool. Turn it on for an agent and each chat gets its own long-lived container based on `ubuntu:26.04`, created the moment the agent first runs a command. Commands go into that container by default, so the agent can `apt-get install` whatever it needs and make a mess without any of it reaching your machine — and because it cannot reach your machine, the command allowlist no longer has to hold it back inside the container. Your project directory is mounted read-write at `/workspace`, so files move in and out freely, and the agent can publish ports if you want to open what it built in a browser. Long-running processes can be started in the background and their output read back later. If the agent genuinely needs your own machine it has to ask for it explicitly, and you get a dialog with the exact command before anything runs; you can allow it once or for the rest of that chat. A Docker whale appears next to the export buttons whenever the current chat has a container, with options to stop, start or remove it. Containers survive switching chats and are stopped when you quit the app, then come back with their installed packages intact. Deleting a chat removes its container, and the delete dialog now offers to delete the sandbox's data folder too — unchecked by default, so anything the agent wrote is kept unless you say otherwise. Compose and data files live under `docker-sandboxes/` in your project directory, using ordinary mapped folders instead of named volumes so you can just look at them. Needs Docker installed; if it is missing the agent tells you how to install it for your platform. Voice chat does not support sandboxes and keeps running host commands under the allowlist as before.
- Docker sandbox folders are now named after the chat instead of a raw timestamp, so `docker-sandboxes/fix-the-auth-bug-a3f21c/` replaces `docker-sandboxes/session_1756900000000/`. A sandbox usually gets created before the chat has a real title, so the folder is renamed automatically whenever the chat title changes — including when a title is generated for you. Renaming only moves the folder: containers keep running and installed packages survive, because Docker still tracks them by a project id that never moves.
- The Docker whale menu now shows the sandbox's folder name and has an **Open sandbox folder** option that reveals it in Finder, Explorer or your Linux file manager, so the compose file and the mapped data folders are easy to inspect. If the folder was deleted outside the app, or the system has no file manager to open it with, the reason is reported instead of failing silently.
- Give wide model logos room to be seen. Most model logos are square glyphs, but xAI's is a wordmark about two and a half times wider than it is tall, and fitting that into a square slot shrank it to a smudge. Wide logos now get the full width available in the chat avatar, the model dropdown and the model button, and they keep their proportions in the Word and PDF exports instead of being squeezed into a square. The icon column in the model dropdown is now a fixed width, so every row's name lines up regardless of which logo it has.

### 2026-09-02

- Keep Mermaid diagrams as `mermaid` code blocks in the Markdown export instead of turning them into
  PNG images. GitHub, VS Code and Obsidian render them from the source, and the diagram stays
  editable and readable as text. DrawIO diagrams and images pasted into the conversation are still
  written as PNGs into the `images/` folder, which is now only created when there is something to put
  in it. The Word and PDF exports are unchanged and still render every diagram as an image.
- Update the app's dependencies. The visible part is a newer Chromium: the app now runs on Electron 44, two major versions on from before, which brings current web platform and security fixes to everything rendered in the window. The AWS SDK also moves to its current release, so newly launched Bedrock models and regions are recognised without waiting for another build.
- Fix ten of the twelve security advisories reported against the app's dependency tree, covering URL parsing, query-string parsing and stylesheet processing. Two remain open with no fix published anywhere: they are denial-of-service bugs in the ICNS, JXL and HEIF decoders of an image library used by the Word exporter, which only ever hands it PNGs, so those code paths are never reached.
- Swap the icon offered for "Azure" when choosing an agent icon, because the icon set removed the Microsoft Azure mark. Agents already set to it keep working and pick up the new glyph.

### 2026-09-01

- Add Claude Fable 5.1 to the model list. It is Anthropic's most capable model for demanding reasoning and long-horizon agentic work, with a 1M token context window, up to 128K output tokens, and thinking always on. Bedrock currently offers it on the global endpoint and, for single-region routing, in US East (N. Virginia) only.

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

- Add ability for user to specify that the agent use another agent profile (via @<profile name>) to accomplish a task. Results come back to the current agent. i.e. use @email to find email from Kevin and compose a reply. This allows the current agent to use the results of another agent's task (tools) without needing to switch back and forth.

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
