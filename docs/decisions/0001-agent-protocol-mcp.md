# ADR 0001: Assistants reach Fridgie over MCP (Streamable HTTP)

Date: 2026-10-16
Status: proposed

Research: [docs/research/4-agent-auth-stack-hosting.md](../research/4-agent-auth-stack-hosting.md), sections 1 to 3.

## Context

The owner wants to use Fridgie from the Claude iOS app on their own subscription, and later from ChatGPT, Gemini and others (#1). The agent interface must use an open standard that no single assistant vendor owns. It is the second client of the one service the web app uses (#1), so it adds no data store or write path of its own.

Claude adds a custom connector as a remote **Model Context Protocol** server, by URL. It uses Streamable HTTP, and legacy HTTP+SSE is "being deprecated". The iOS app uses the same connector infrastructure as the web app. ChatGPT (developer mode), the Gemini app (custom apps) and Mistral Le Chat also accept remote MCP servers today, each with its own tier limits (research, section 2). MCP is governed by the Linux Foundation's Agentic AI Foundation, which counts Anthropic, OpenAI, Google and Microsoft among its members.

## Decision

Fridgie exposes one **remote MCP server** at the path **`/mcp`** on its own origin, over **Streamable HTTP**, protected by OAuth as ADR 0002 specifies.

- **Protocol version.** It must accept the 2025-era `initialize` handshake (`2025-06-18` and `2025-11-25`), because those are the versions Claude's documentation names. Answering the 2026-07-28 revision as well is allowed, through the SDK's version negotiation, but it is not required.
- **State.** It runs stateless, with no server-held MCP session, so every request stands alone on a Worker (ADR 0003).
- **Surface.** It exposes **tools** only. Resources, prompts, sampling and subscriptions are not used. Claude does not support subscriptions or sampling, and the 2026 revision deprecates sampling.
- **Annotations.** Every tool declares `readOnlyHint` and `destructiveHint`, which Claude requires.
- **One write path.** Every tool calls the same service layer the web app calls (#7, #8), and nothing under `/mcp` reads or writes storage directly.
- **Designer's surface.** The tool names, inputs and descriptions belong to the designer (#6). This ADR fixes only the protocol they ride on.

## Consequences

- Claude (web, desktop, iOS, Android, Code), ChatGPT developer mode, the Gemini app's custom apps, and Le Chat can all connect to the same URL. The guide #8 writes describes one URL and one OAuth flow for all of them.
- **Writes depend on the assistant's tier, not on Fridgie.** ChatGPT allows write actions to custom MCP servers only on Business, Enterprise and Edu. Pro gets read and fetch only, and Plus is not mentioned on the current help page. Gemini custom apps need a US personal account, and per the newer help page Gemini Spark, which needs Google AI Pro or Ultra. On those tiers "I used the last of the milk" will not work, whatever Fridgie does.
- A Claude Free account can add exactly one custom connector. Pro and Max have no stated limit.
- The protocol is still moving (2026-07-28 changed the transport). Pinning the server to the 2025-era handshake keeps Claude working. Following the spec forward is an SDK upgrade, not a redesign.
- MCP does not rule out a REST API for the web client. The web app uses the service layer directly, not MCP.

## Alternatives rejected

- **OpenAPI or REST "actions" as the agent interface.** Claude's connector documentation accepts only MCP servers, so the owner's first goal (Claude iOS) would be impossible.
- **Agent2Agent (A2A).** It is a protocol for agents delegating to agents, not a tool server. None of the assistants checked accepts an A2A endpoint as a connector.
- **A local (stdio) MCP server or desktop extension.** The iOS app cannot run a local process, and only Claude Desktop installs local extensions.
- **Vendor-specific extensions as the primary interface** (for example ChatGPT Apps SDK widgets). They layer on MCP and are optional. Depending on them would tie the interface to one vendor, which #1 rules out.
