# AutoABM Multi-Agent System Documentation

> Complete guide and technical reference for multi-agent orchestration

---

## Documentation Index

### [01-usage-guide.md](./01-usage-guide.md) â€?Usage Guide

A comprehensive user-facing manual covering:

- **Agent Tool**: Parameter reference, spawn methods, background execution
- **Six Built-in Agents**: general-purpose, Explore, Plan, verification, claude-code-guide, statusline-setup
- **Background Tasks**: Asynchronous execution, progress tracking, completion notifications
- **Agent Teams**: Team creation, member collaboration, message communication
- **Worktree Isolation**: Independent environments, branch management, secure contexts
- **Custom Agents**: Definition format, tool pool configuration, system prompts

**Target Audience**: All AutoABM users

---

### [02-implementation.md](./02-implementation.md) â€?Implementation Details

A deep technical reference for developers covering:

- **Architecture Overview**: 5 agent categories, 4 spawn paths
- **Agent Spawn Flow**: Detailed walkthrough of Sync / Async / Fork / Teammate paths
- **Tool Pool System**: Three-layer filtering, constant definitions, permission mapping
- **Context Passing**: CacheSafeParams, system prompt construction, fork cache optimization
- **Teams Internals**: TeamFile structure, mailbox system, inbox polling, message routing
- **Background Task Engine**: LocalAgentTask lifecycle, progress tracking, notification queue
- **Permission Synchronization**: Team-level permissions, mode propagation, bubble mode
- **End-to-End Data Flow**: From Agent Tool invocation to result delivery

**Target Audience**: Contributors, architects, and developers seeking deep implementation understanding

---

### [03-agent-framework.md](./03-agent-framework.md) â€?Agent Framework Deep Dive

Deconstructing the architecture behind Claude Code's agent framework from source code, covering:

- **Core Agent Loop**: AsyncGenerator state machine, five-phase while(true) loop
- **System Prompt Engineering**: Layered construction, cache boundary, CLAUDE.md loading
- **Tool System Design**: Full lifecycle management, three-stage registration, 7-step execution pipeline
- **Context Management & Compression**: Four-level progressive compression, system context injection
- **Skills & Plugin Ecosystem**: Skill definition and discovery, plugins, hooks, MCP integration
- **Permission & Security Model**: Layered permission model, rule pattern matching
- **Fault Recovery Mechanisms**: 6 built-in recovery strategies, model fallback
- **Comparison with LangChain/ReAct**: Architecture paradigm differences, why not ReAct
- **Why Claude Code Is So Good**: 7 core design principles

**Target Audience**: Architects studying AI agent design, AI application developers, technical researchers

---

## Illustration Notes

All diagrams use a dark background (#1a1a2e) with AutoABM orange-blue accent (#FF7A00), consistent with Claude Code's official documentation style.

| Image | Description | Document |
|-------|-------------|----------|
| `01-agent-overview.png` | Multi-Agent System Overview â€?Architecture panorama | Usage Guide |
| `02-agent-types.png` | Six Built-in Agents â€?Type comparison matrix | Usage Guide |
| `03-spawn-flow.png` | Agent Spawn Flow â€?Four-path decision tree | Usage Guide |
| `04-agent-teams.png` | Agent Teams Collaboration â€?Team communication topology | Usage Guide |
| `05-architecture.png` | Implementation Architecture â€?Core module relationships | Implementation |
| `06-context-passing.png` | Context Passing â€?CacheSafeParams data flow | Implementation |
| `07-tool-pool.png` | Tool Pool System â€?Three-layer filtering pipeline | Implementation |
| `08-background-task.png` | Background Task Engine â€?Lifecycle state machine | Implementation |
| `09-teams-mailbox.png` | Teams Mailbox System â€?Message routing topology | Implementation |
| `10-fork-cache.png` | Fork Cache Optimization â€?Byte-level consistent sharing | Implementation |
| `11-agent-framework-overview.png` | Agent Framework Overview â€?Core component relationships | Framework Deep Dive |
| `12-agent-core-loop.png` | Core Agent Loop â€?Five-phase state machine | Framework Deep Dive |
| `13-system-prompt-pipeline.png` | System Prompt Pipeline â€?Layered cache pipeline | Framework Deep Dive |
| `14-context-compression.png` | Context Compression â€?Four-level progressive strategy | Framework Deep Dive |

---

## Quick Start

### For Users

1. Read the [Usage Guide](./01-usage-guide.md)
2. Learn about the six built-in agents and their use cases
3. Try spawning subagents using the Agent tool in a conversation
4. Explore multi-agent collaboration with Agent Teams

### For Developers

1. Read the [Implementation Details](./02-implementation.md)
2. Browse the source code:
   - `src/tools/AgentTool/` â€?Agent tool implementation
   - `src/tools/TeamCreateTool/` â€?Team creation
   - `src/tools/SendMessageTool/` â€?Inter-agent communication
   - `src/utils/swarm/` â€?Swarm collaboration infrastructure
   - `src/utils/forkedAgent.ts` â€?Fork agent context
   - `src/tasks/` â€?Task management system
3. Understand the four spawn paths and context passing mechanisms

---

## Core Concepts Quick Reference

| Concept | Description |
|---------|-------------|
| **Agent Tool** | Primary entry point â€?accepts a prompt + subagent_type to spawn a subagent |
| **Subagent** | An independent child agent that executes tasks with its own tool pool and permissions |
| **Fork Agent** | A forked agent that inherits the parent's full context and shares prompt cache |
| **Teammate** | A collaborative member within an Agent Team, communicating via mailbox |
| **Worktree** | Git worktree isolation mode providing an independent file environment |
| **LocalAgentTask** | Local agent task state, tracking running/completed/failed status |
| **DreamTask** | Automatic memory consolidation task that runs periodically in the background |
| **CacheSafeParams** | Cache-safe parameters ensuring byte-level consistency of API request prefixes |
| **TeamFile** | Team configuration file storing the member list and permissions |
| **Mailbox** | File-based message queue supporting asynchronous communication between teammates |

---

## Related Resources

- [AutoABM Home](/)
- [Memory System Documentation](/en/memory/01-usage-guide)
- [Agent Tool Source Code](https://github.com/SocialAI-X/Auto-ABM/tree/main/src/tools/AgentTool/)
- [Swarm Infrastructure](https://github.com/SocialAI-X/Auto-ABM/tree/main/src/utils/swarm/)
- [Task Management System](https://github.com/SocialAI-X/Auto-ABM/tree/main/src/tasks/)
- [GitHub Issues](https://github.com/SocialAI-X/Auto-ABM/issues)
