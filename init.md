# Build an Open-Source Agentic CLI + Agent Skill for Building Specialized Agents

## Mission

Build an **open-source, agentic-first CLI + Agent Skill** that helps an AI agent progressively understand a problem, derive the right questions, consume available context, and ultimately design and build **specialized agents/agent systems**.

This is **NOT a web app**.

This is **NOT a traditional GUI application**.

The primary product is:

1. A **CLI**
2. An **Agent Skill** following current agent/skill conventions
3. A composable architecture for **multiple specialized agents**
4. A pluggable **context-framework system**
5. A progressive, recursive questioning engine
6. An open-source, agent-agnostic implementation

The agent should be able to use the CLI and Skill from environments such as Claude Code, Codex, Cursor, other coding agents, or directly from a terminal.

The system must not be designed around a single AI provider.

---

# 1. Core Philosophy

The fundamental principle is:

> **Don't ask the user to know what questions need to be answered. Let the agent discover the questions.**

The system should start with incomplete intent.

For example:

```text
"I want an agent that helps developers debug production issues."
```

Do NOT immediately generate an architecture.

Instead:

```text
Initial intent
      ↓
Understand intent
      ↓
Identify unknowns
      ↓
Ask highest-value question
      ↓
Process answer
      ↓
Derive new questions
      ↓
Ask next question
      ↓
Repeat
      ↓
Reach sufficient confidence
      ↓
Produce agent specification
      ↓
Build / configure / validate specialized agent
```

Questions must be **derived from previous answers**, not simply pulled from a static questionnaire.

The conversation is therefore a dynamic decision tree.

---

# 2. Agentic-First

The system should assume an **AI agent is the primary operator**.

A human can use the CLI, but the architecture must not depend on a human manually driving every step.

The CLI must therefore expose machine-readable operations.

For example:

```bash
agent-builder init --json
agent-builder status --json
agent-builder question --json
agent-builder answer --json
agent-builder context --json
agent-builder plan --json
agent-builder validate --json
agent-builder build --json
```

Human-readable terminal output should remain excellent, but every important operation should have a structured representation suitable for another agent.

Do not make agents scrape terminal text.

---

# 3. Progressive Question Engine

This is one of the most important components.

The engine must maintain a structured representation of:

* objective
* assumptions
* known facts
* unknowns
* constraints
* requirements
* decisions
* contradictions
* dependencies
* risks
* confidence
* unresolved questions
* evidence/provenance

Example:

```text
Intent:
  Build an agent for debugging production systems.

Known:
  - Used by software developers
  - Needs access to logs

Unknown:
  - Which infrastructure?
  - Which languages?
  - Read-only or remediation?
  - What permissions?
  - Human approval?
  - Incident-management integration?
```

The engine chooses the next question based on **information value**.

A question should be selected because its answer can materially affect the resulting architecture or behavior.

Avoid asking low-value questions simply to make the process longer.

---

# 4. Recursive Question Derivation

Questions must generate new questions.

Example:

```text
User:
"The agent should automatically fix production issues."

Agent:
"What systems is it allowed to modify?"

User:
"Kubernetes."

Agent:
"What level of Kubernetes access should it have?"

User:
"It can restart deployments."

Agent:
"Should it be allowed to modify deployment manifests, or only restart existing workloads?"

User:
"Only restart."

Agent:
"Should a human approve a restart before execution?"

...
```

The system must continuously update the knowledge state.

This is not:

```text
Question 1
Question 2
Question 3
Question 4
```

It is:

```text
Question
   ↓
Answer
   ↓
New state
   ↓
New uncertainty
   ↓
New question
```

---

# 5. Specialized Agent Architecture

The system must support creating **multiple specialized agents**, not just one generic agent.

The architecture should allow:

```text
Agent Suite
├── Research Agent
├── Coding Agent
├── Debugging Agent
├── Security Agent
├── Documentation Agent
├── Testing Agent
└── Custom Agent
```

A project may contain many agents.

Each specialized agent should have:

* identity
* purpose
* scope
* capabilities
* constraints
* tools
* inputs
* outputs
* context requirements
* behavioral rules
* validation criteria
* escalation rules
* dependencies
* skills
* optional sub-agents

Agents should be composable.

For example:

```text
Orchestrator
   │
   ├── Research Agent
   ├── Architecture Agent
   ├── Implementation Agent
   ├── Test Agent
   └── Review Agent
```

Do not hard-code these names. They are examples.

---

# 6. Agent Skill Standard

The project must follow the ecosystem's emerging conventions around agent skills.

Investigate current standards and conventions before implementing them.

The implementation should support the appropriate:

```text
SKILL.md
AGENTS.md
```

patterns where applicable.

Do not assume one vendor owns the format.

The Skill should be **agent-agnostic**.

The canonical workflow should live in a Skill such as:

```text
.agents/skills/<skill-name>/SKILL.md
```

while project-wide persistent instructions may live in:

```text
AGENTS.md
```

Do not use instruction files as security boundaries.

They are behavioral/context mechanisms, not enforcement mechanisms.

Where appropriate, provide compatibility/adapters for environments such as:

* Claude Code
* Codex
* Cursor
* MCP-enabled agents
* generic coding agents

Do not make the core architecture dependent on any one of them.

---

# 7. Context Frameworks

Add a **generic, pluggable Context Framework interface**.

This is a first-class architectural requirement.

The system must not assume that its own context mechanism is the only possible one.

Conceptually:

```text
                 ┌──────────────────────┐
                 │   Agent Builder      │
                 └──────────┬───────────┘
                            │
                    Context Interface
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
   Local filesystem     Git repository    External framework
          │                 │                 │
          ▼                 ▼                 ▼
       Adapter           Adapter          Adapter
```

A context framework should be able to provide:

* discovery
* ingestion
* normalization
* indexing
* retrieval
* scoped context
* provenance
* confidence
* relationships
* optional architecture/code knowledge

Design a small stable contract rather than coupling the core system to one implementation.

---

# 8. Optional Agents Code Context Integration

Provide an optional integration with:

https://github.com/EnzoVezzaro/agents-code-context

Treat **Agents Code Context (ACC)** as an optional context framework/adapter.

It must NOT become a hard dependency.

It must NOT define the core architecture.

The CLI should support something conceptually like:

```bash
agent-builder init \
  --context-framework agents-code-context
```

and/or:

```bash
agent-builder init \
  --with-context agents-code-context
```

It should also be possible to specify an arbitrary framework:

```bash
agent-builder init \
  --context-framework ./my-context-framework
```

or:

```bash
agent-builder init \
  --context-framework https://github.com/example/context-framework
```

Support multiple context sources:

```bash
agent-builder init \
  --context ./docs \
  --context ./architecture \
  --context https://github.com/example/repository
```

The architecture must distinguish:

```text
Context Framework
      ≠
Agent
      ≠
Agent Skill
      ≠
Core Question Engine
```

These are separate concerns.

---

# 9. ACC Compatibility

ACC should be consumed as an information/context layer.

Do not duplicate an ACC shadow graph unnecessarily.

Do not make the coding agent responsible for maintaining a second representation of the codebase unless explicitly required by the context-framework contract.

The underlying source code remains authoritative for structural truth.

Context is derived knowledge.

Treat context as potentially:

* incomplete
* stale
* lossy
* scoped
* probabilistic
* derived

Therefore context responses should expose appropriate metadata such as:

```json
{
  "confidence": 0.91,
  "provenance": ["..."],
  "stale": false
}
```

where meaningful.

The system should avoid overfeeding agents.

Use:

* scoped retrieval
* progressive disclosure
* information boundaries
* task-specific context
* relevance filtering

The goal is **better context**, not maximum context.

---

# 10. Context Interface

Define a formal interface.

Conceptually:

```text
ContextFramework

discover()
ingest()
normalize()
index()
retrieve()
relationships()
architecture()
dependencies()
impact()
```

Not every framework must implement every operation.

Capabilities should be discoverable.

For example:

```json
{
  "framework": "agents-code-context",
  "capabilities": [
    "search",
    "lookup",
    "context",
    "relationships",
    "dependencies",
    "impact",
    "architecture"
  ]
}
```

Do not assume every adapter provides all capabilities.

---

# 11. Semantic Context Model

The system should favor semantic operations over raw file dumping.

Examples:

```text
search
lookup
context
relationships
dependencies
impact
architecture
```

Prefer:

```text
"Give me the context relevant to implementing authentication."
```

over:

```text
"Give me the entire repository."
```

The context system should support escalation.

A useful model is:

```text
Agent question
      ↓
Scoped semantic context
      ↓
Enough information?
    /       \
  yes        no
  ↓          ↓
continue    escalate
             ↓
        deeper context
             ↓
          source
```

Raw source should be an escalation mechanism, not the default context payload.

---

# 12. Agent Specification

Once questioning reaches sufficient confidence, generate a structured agent specification.

For example:

```yaml
agent:
  name: production-debugger
  purpose: ...
  scope: ...
  responsibilities:
    - ...
  non_goals:
    - ...

inputs:
  - ...

outputs:
  - ...

tools:
  - ...

context:
  framework: ...
  scopes:
    - ...

permissions:
  read:
    - ...
  write:
    - ...

constraints:
  - ...

escalation:
  - ...

validation:
  - ...

dependencies:
  - ...
```

Do not constrain the implementation to YAML if another representation is more appropriate.

The specification should be machine-readable and human-readable.

---

# 13. Generated Agent Skill

The builder should be able to generate a Skill for the resulting specialized agent.

Example:

```text
.agents/
└── skills/
    ├── production-debugger/
    │   └── SKILL.md
    ├── architecture-reviewer/
    │   └── SKILL.md
    └── test-agent/
        └── SKILL.md
```

Each generated Skill should use progressive disclosure.

The top-level Skill should contain the essential workflow and references to deeper material.

Avoid creating enormous instruction files.

---

# 14. CLI Design

Create a coherent CLI.

Potential commands:

```bash
agent-builder init
agent-builder interview
agent-builder question
agent-builder answer
agent-builder context
agent-builder agents
agent-builder spec
agent-builder plan
agent-builder build
agent-builder validate
agent-builder inspect
agent-builder status
```

Use whichever command structure is ultimately most ergonomic.

The CLI should support:

```bash
--json
--quiet
--verbose
--context
--context-framework
--with-context
--output
--agent
--non-interactive
```

Do not blindly implement every flag above if the architecture suggests a better interface, but preserve the underlying capabilities.

---

# 15. Non-Interactive Agent Mode

An agent must be able to run the workflow without terminal interaction.

Example:

```bash
agent-builder init \
  --non-interactive \
  --context ./project \
  --json
```

The system should return structured state such as:

```json
{
  "status": "needs_input",
  "questions": [
    {
      "id": "q_001",
      "question": "...",
      "reason": "...",
      "impact": "high"
    }
  ]
}
```

An agent can then provide:

```bash
agent-builder answer q_001 "..."
```

This enables another AI agent to drive the entire process.

---

# 16. Persistent State

Multi-step sessions need explicit state.

Do not rely exclusively on conversation history.

Represent the current session explicitly.

Conceptually:

```text
Session
├── intent
├── facts
├── assumptions
├── constraints
├── decisions
├── questions
├── answers
├── contradictions
├── context
├── evidence
├── confidence
└── generated specification
```

State should be inspectable.

For example:

```bash
agent-builder status
agent-builder inspect
```

The system should support resuming a session.

---

# 17. Information Firewall

One of the most important design principles is:

> **Do not give the agent everything simply because it is available.**

Context should flow through boundaries.

```text
Repository
     ↓
Context Framework
     ↓
Relevant context
     ↓
Question Engine
     ↓
Specialized Agent
```

The system should minimize unnecessary information exposure.

Context should be:

* relevant
* scoped
* progressive
* provenance-aware
* task-specific

This should be an architectural principle, not merely a prompt instruction.

---

# 18. Confidence and Completeness

The system needs a way to determine whether it knows enough to proceed.

Do not use arbitrary:

```text
"Ask 10 questions."
```

Instead reason about completeness.

For example:

```text
Requirement coverage
Constraint coverage
Tool coverage
Permission coverage
Input/output coverage
Context coverage
Risk coverage
Validation coverage
```

The engine should be able to say:

```text
READY
```

or:

```text
NEEDS_INFORMATION
```

or:

```text
CONFLICTING_REQUIREMENTS
```

or:

```text
INSUFFICIENT_CONTEXT
```

---

# 19. Contradiction Detection

If the user says:

```text
"The agent must never modify production."
```

and later:

```text
"It should automatically restart failed production deployments."
```

the system must detect the contradiction.

Do not silently overwrite the previous requirement.

Create an explicit conflict:

```text
CONFLICT:
  Requirement A: read-only production access
  Requirement B: automatic production restart

Resolution required.
```

Then derive the next question.

---

# 20. Question Quality

Questions should be:

* minimal
* specific
* contextual
* high-impact
* understandable
* derived from current state

Avoid:

```text
What is your preferred database?
```

unless the database decision actually matters.

Prefer:

```text
The agent needs persistent state across sessions. Should that state be local to the project, shared across agents, or remote?
```

The question should explain *why* it matters when appropriate.

---

# 21. Multiple Agents

The system must support agent teams.

Example:

```text
Agent Suite
     │
     ▼
Orchestrator
     │
 ┌───┼────────┐
 ▼   ▼        ▼
A    B        C
```

Agents may:

* invoke other agents
* delegate tasks
* share selected context
* produce artifacts
* validate one another
* escalate to humans

But sharing must be explicit.

Do not create a giant shared context pool.

---

# 22. Agent-to-Agent Context

Context passed between agents should be scoped.

Example:

```text
Research Agent
      ↓
research findings
      ↓
Architecture Agent
      ↓
architecture decision
      ↓
Implementation Agent
```

The Implementation Agent should not automatically receive the entire research history.

It receives the relevant artifact/context.

This is the same information-firewall principle applied between agents.

---

# 23. Open Source

The project must be designed as a serious open-source project.

Include:

```text
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
CHANGELOG.md
```

Use a clear open-source license.

Provide:

* installation instructions
* CLI examples
* architecture documentation
* Skill documentation
* context-framework documentation
* adapter development documentation
* examples
* tests
* CI
* release process

---

# 24. Repository Structure

Start with a clean architecture.

For example:

```text
/
├── README.md
├── LICENSE
├── AGENTS.md
├── package.json
├── src/
│   ├── cli/
│   ├── core/
│   │   ├── interview/
│   │   ├── questions/
│   │   ├── state/
│   │   ├── specification/
│   │   ├── agents/
│   │   └── validation/
│   ├── context/
│   │   ├── interface/
│   │   ├── adapters/
│   │   └── registry/
│   ├── orchestration/
│   └── output/
├── skills/
│   └── agent-builder/
│       └── SKILL.md
├── examples/
├── tests/
└── docs/
```

Adapt this to the chosen implementation language and package conventions.

Do not force this exact tree if a better architecture emerges.

---

# 25. Technology Choices

Choose technologies based on the problem rather than familiarity.

The implementation should prioritize:

* fast CLI startup
* cross-platform support
* excellent terminal UX
* strong typing
* deterministic core behavior
* testability
* extensibility
* easy installation

If a compiled language such as Rust provides meaningful advantages, evaluate it.

If TypeScript/Node provides significantly better ecosystem interoperability for the agent/Skill ecosystem, evaluate that as well.

Make the decision explicit in the architecture documentation.

Do not introduce unnecessary dependencies.

---

# 26. Provider Agnostic

The system must not be locked to:

```text
OpenAI
Anthropic
Google
xAI
DeepSeek
Z.ai
```

or any other provider.

The core should define an abstraction for model reasoning where necessary.

Provider-specific integrations should live behind adapters.

The system should work with whatever model/agent environment is operating it.

---

# 27. MCP

Evaluate MCP as an integration layer rather than as the core architecture.

If MCP materially improves interoperability, expose the appropriate capabilities through MCP.

But:

```text
CLI ≠ MCP
Skill ≠ MCP
Context Framework ≠ MCP
```

They should remain separable.

A local CLI should work without a remote service.

---

# 28. Progressive Disclosure

Both the Skill and generated agent instructions must use progressive disclosure.

Do not put the entire architecture into `SKILL.md`.

A good pattern is:

```text
SKILL.md
   ↓
Core workflow
   ↓
references/
   ├── architecture.md
   ├── context.md
   ├── questioning.md
   ├── agents.md
   └── validation.md
```

The agent should retrieve deeper information only when necessary.

---

# 29. Safety / Permissions

Generated agents may eventually perform actions.

Therefore explicitly model:

```text
read permissions
write permissions
execution permissions
network permissions
secrets access
production access
human approval
```

Do not assume that an instruction in Markdown is sufficient enforcement.

Where enforcement matters, implement it in actual runtime/CLI/tool boundaries.

---

# 30. Testing

Build comprehensive tests around the core behavior.

Especially test:

### Progressive questioning

Given:

```text
"I want a deployment agent."
```

the system should ask meaningful questions.

Then after:

```text
"Kubernetes."
```

the next question should change.

### Context

Verify:

```text
--context
--context-framework
--with-context
```

work independently and together.

### ACC

Verify the optional Agents Code Context adapter can be discovered/configured without making ACC mandatory.

### Custom frameworks

Verify an arbitrary external/local context adapter can be registered.

### Contradictions

Verify conflicting requirements trigger resolution.

### Multi-agent

Verify agents can be created and composed.

### JSON

Every important CLI operation should have deterministic structured output.

### Resume

Kill the process and resume the session.

### Information boundaries

Verify that scoped context does not accidentally become global context.

---

# 31. Example End-to-End Workflow

The finished project should support a workflow resembling:

```bash
agent-builder init
```

User/agent:

```text
I want to build an agent that helps developers fix difficult bugs.
```

System:

```text
What kind of bugs?
```

User:

```text
Production bugs.
```

System derives:

```text
What systems does it need to inspect?
```

User:

```text
Our TypeScript backend and Kubernetes infrastructure.
```

System derives:

```text
Should it only diagnose incidents, or is it allowed to make changes?
```

User:

```text
It can suggest changes, but humans approve them.
```

System derives:

```text
What source-code and infrastructure context should it use?
```

At this point the user adds:

```bash
agent-builder context add ./backend
agent-builder context add ./infra
```

Then:

```bash
agent-builder init \
  --context-framework agents-code-context
```

The context framework provides relevant architecture/code information.

The questioning engine continues.

Eventually:

```text
Specification complete.

Agent:
  production-debugger

Capabilities:
  - inspect code
  - inspect Kubernetes configuration
  - correlate errors
  - propose fixes
  - generate patches

Permissions:
  - source read
  - infrastructure read
  - source write: proposal only
  - production write: prohibited

Human approval:
  required before applying changes
```

Then:

```bash
agent-builder build
```

produces the specialized agent Skill and supporting configuration.

---

# 32. Important Architectural Principle

Keep these layers separate:

```text
┌─────────────────────────────────────┐
│             Agent Skill             │
│   How an agent should operate      │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│            CLI / Runtime            │
│  Actual operations and enforcement │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│          Question Engine            │
│ Intent → uncertainty → questions   │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│        Context Framework API        │
└──────────────────┬──────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
       ACC       Git       Custom
```

Do not collapse these layers into one giant prompt.

---

# 33. What NOT to Build

Do not build:

* a web dashboard
* a SaaS
* a proprietary agent platform
* a provider-specific system
* a giant prompt template
* a static questionnaire
* a monolithic Skill
* a mandatory ACC dependency
* a giant repository dump mechanism
* a system that assumes one agent
* a system where Markdown instructions are treated as security
* unnecessary hosted infrastructure

The first implementation should be **local, open, inspectable, composable, and agent-driven**.

---

# 34. CLI UX

The CLI should feel like a serious developer tool.

Example:

```text
$ agent-builder init

◇ What are you trying to build?
  › A production debugging agent

◇ What does "production debugging" include?
  › Diagnose incidents and propose fixes

◇ Which systems must it understand?
  › TypeScript services + Kubernetes

◇ Should it modify production?
  › No

✓ Intent captured
✓ Constraints identified
✓ Context requirements identified

2 high-impact questions remain.
```

But this presentation is secondary.

The underlying structured state is primary.

---

# 35. Context Framework Registry

Implement a registry mechanism.

Conceptually:

```text
Context Framework Registry

agents-code-context
filesystem
git
custom
```

Each adapter should declare:

```text
name
version
capabilities
configuration
input types
output types
```

The registry should support discovery.

Example:

```bash
agent-builder context frameworks
```

Output:

```text
Available Context Frameworks

✓ filesystem
✓ git
✓ agents-code-context
○ custom
```

Do not require all adapters to ship in the core package if that creates unnecessary coupling.

---

# 36. External Framework Contract

Document how third parties can build adapters.

A developer should be able to create:

```text
my-context-framework
```

and plug it into the builder without modifying the core questioning engine.

This is critical.

The system should become an ecosystem, not a single implementation.

---

# 37. Deliverables

Build the actual repository, not just documentation.

Deliver:

1. Working CLI
2. Working progressive question engine
3. Persistent session state
4. Structured agent specification
5. Multi-agent model
6. Agent Skill
7. Context Framework API
8. Built-in local context adapter
9. Optional ACC adapter
10. Custom adapter mechanism
11. JSON CLI interface
12. Validation system
13. Tests
14. Documentation
15. Examples
16. CI
17. Open-source project metadata

---

# 38. Development Process

Before writing significant code:

1. Inspect the repository.
2. Inspect existing files and conventions.
3. Determine the current implementation state.
4. Search the current ecosystem standards for `SKILL.md`, `AGENTS.md`, and relevant agent-skill conventions.
5. Inspect the Agents Code Context project and understand its current interface rather than guessing.
6. Identify the minimum viable architecture.
7. Write/update the architecture document.
8. Implement the core.
9. Implement the CLI.
10. Implement the Skill.
11. Implement context adapters.
12. Add tests.
13. Run the complete test suite.
14. Exercise the CLI end-to-end.
15. Fix issues.
16. Update documentation.

Do not rewrite working code unnecessarily.

---

# 39. Agent Operating Instructions

You are the implementation agent.

You are expected to **inspect, reason, implement, test, and iterate**.

Do not stop at producing a plan.

When requirements are ambiguous, use the same progressive-questioning philosophy this project is designed to implement:

1. Inspect available evidence.
2. Determine what is actually unknown.
3. Resolve high-impact uncertainty.
4. Continue implementation.
5. Validate assumptions through the repository and current standards.

Prefer evidence from the actual repository and current standards over assumptions.

Do not invent APIs for external projects.

---

# 40. Definition of Done

The project is done when an external AI coding agent can clone the repository, install the CLI, load the Skill, and use the system to progressively turn an incomplete idea into a well-defined specialized agent.

At minimum, this must work:

```bash
agent-builder init
```

then:

```text
intent
  ↓
progressive questions
  ↓
context
  ↓
requirements
  ↓
agent specification
  ↓
validation
  ↓
generated specialized-agent Skill
```

And this must also work:

```bash
agent-builder init \
  --context ./project \
  --context-framework agents-code-context \
  --json
```

while a completely different third-party context framework can be substituted without changing the core engine.

The resulting system should feel less like a "prompt generator" and more like:

> **an executable, inspectable reasoning workflow for discovering what an agent needs to know before building the agent itself.**

Build it as a real open-source developer tool.

# Multi-Agent Runtime & Model Capability

Multi-agent support is a **first-class requirement**.

The system must not assume that every model has the same agent capabilities.

Detect and expose the capabilities available in the current runtime/model environment.

Conceptually:

```text
Model / Runtime Capabilities
│
├── single-agent
├── sub-agents
├── parallel agents
├── agent handoffs
├── agent delegation
├── tool-use
├── persistent agents
└── agent teams
```

The architecture must adapt to these capabilities.

## Capability Detection

Provide a capability model such as:

```json
{
  "multi_agent": true,
  "sub_agents": true,
  "parallel_execution": true,
  "handoffs": true,
  "delegation": true
}
```

Do not hard-code these capabilities to a particular provider.

The capability layer should be provider/runtime agnostic.

---

## Native First

If the current model or coding-agent runtime supports native subagents, teams, delegation, parallel execution, or handoffs:

**use the native mechanism first.**

Do not unnecessarily recreate a parallel-agent system inside the CLI.

The project should act as an orchestration/specification layer that understands what the runtime can do.

For example:

```text
Agent Builder
      │
      ▼
Capability Detection
      │
      ├── Native multi-agent available
      │       ↓
      │   Use native runtime
      │
      └── Not available
              ↓
          CLI fallback
```

---

# Agent Graph

The generated specification should support an agent graph rather than only a flat list.

Example:

```text
                    Orchestrator
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
         Research     Architect    Security
             │           │           │
             └───────────┼───────────┘
                         ▼
                    Implementer
                         │
                         ▼
                       Tester
                         │
                         ▼
                      Reviewer
```

The graph should support:

* sequential execution
* parallel execution
* delegation
* handoffs
* dependencies
* conditional routing
* aggregation
* review
* escalation to human
* retry/replanning

---

# Agent Definition

Each agent should be independently defined:

```yaml
agent:
  id: architecture-agent
  role: architecture
  purpose: ...
  capabilities:
    - repository-analysis
    - architecture-design

  inputs:
    - requirements
    - research

  outputs:
    - architecture-spec

  context:
    scopes:
      - architecture
      - source

  permissions:
    read:
      - repository

    write: []

  delegates:
    - research-agent

  handoff:
    to:
      - implementation-agent
```

The exact format can be JSON/YAML/etc., but the semantic model must support these relationships.

---

# Parallel Agents

When the runtime supports parallel execution, the planner should be able to determine that independent tasks can execute concurrently.

Example:

```text
                    Orchestrator
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          Research    Security    Architecture
              │          │          │
              └──────────┼──────────┘
                         ▼
                     Synthesis
```

The orchestrator should not serialize work unnecessarily.

However, parallel execution must only occur when dependencies permit it.

---

# Context Isolation

Multi-agent execution must preserve the information-firewall principle.

Do NOT create:

```text
Global Context
     ↓
Every Agent
```

Instead:

```text
                Context Framework
                       │
                Relevant Context
                       │
                 Orchestrator
                /      |       \
               /       |        \
              ▼        ▼         ▼
          Agent A   Agent B   Agent C
             │        │          │
             ▼        ▼          ▼
          scoped    scoped     scoped
          context   context    context
```

Each agent should receive only the context required for its task.

Agent outputs should become explicit artifacts that can be selectively passed to other agents.

---

# Agent Handoffs

Support explicit handoffs.

Example:

```text
Research Agent
      ↓
Research Artifact
      ↓
Architecture Agent
```

The Architecture Agent should receive the research artifact, not necessarily the Research Agent's entire internal context.

A handoff should specify:

```json
{
  "from": "research-agent",
  "to": "architecture-agent",
  "artifacts": [
    "research-report"
  ],
  "context_scope": [
    "architecture-relevant"
  ]
}
```

---

# Agent Teams

The system should support defining teams of specialized agents.

Example:

```text
team:
  name: software-engineering
  coordinator: architect
  members:
    - researcher
    - architect
    - implementer
    - tester
    - reviewer
```

Teams may be dynamically generated by the progressive specification process.

For example, the user starts with:

```text
"I need an agent that analyzes complex production bugs."
```

The system may determine that the required solution is actually:

```text
production-debugging-team
├── incident-researcher
├── code-analysis-agent
├── infrastructure-agent
├── hypothesis-agent
└── reviewer
```

This decision should emerge from requirements rather than from a fixed template.

---

# Dynamic Agent Creation

The system must be able to determine that a single agent is insufficient.

The progressive questioning process should therefore evaluate:

```text
Can one agent reliably perform this task?
```

If not:

```text
What responsibilities should be separated?
```

Then derive specialized agents.

For example:

```text
Complex task
     ↓
Decompose responsibilities
     ↓
Identify independent capabilities
     ↓
Create specialized agents
     ↓
Define dependencies
     ↓
Define communication artifacts
     ↓
Define orchestration
```

---

# Model-Aware Planning

The final agent specification should contain the runtime requirements.

Example:

```yaml
runtime:
  requirements:
    multi_agent: true
    parallel_execution: true
    handoffs: true
```

If the selected runtime does not support a required capability, the validator should report:

```text
UNSUPPORTED CAPABILITY

This agent architecture requires:
  ✓ multi-agent
  ✓ handoffs
  ✓ parallel execution

Current runtime:
  ✓ multi-agent
  ✗ parallel execution

Options:
  1. Enable a compatible runtime
  2. Serialize the workflow
  3. Re-plan the agent architecture
```

The system should never silently pretend that a runtime supports a capability it does not actually provide.

---

# Provider/Runtime Adapters

Keep runtime-specific behavior behind adapters.

Conceptually:

```text
Runtime Interface
       │
       ├── Native Runtime A
       ├── Native Runtime B
       ├── Coding Agent Runtime
       └── Generic CLI Runtime
```

The core agent specification remains provider-neutral.

A provider/runtime adapter translates:

```text
Agent Graph
     ↓
Runtime-specific representation
```

---

# Fallback Mode

If no native multi-agent capability exists, provide a deterministic fallback where practical.

For example:

```text
Orchestrator CLI
      ↓
spawn agent
      ↓
collect artifact
      ↓
spawn next agent
      ↓
collect artifact
      ↓
synthesize
```

Do not require a hosted service for this.

The fallback should work locally whenever the underlying environment permits it.

---

# Multi-Agent Validation

Validate:

* circular dependencies
* missing agents
* invalid handoffs
* unavailable capabilities
* excessive context sharing
* conflicting permissions
* missing outputs
* impossible dependencies
* unsupported parallelism
* orphaned agents
* unbounded delegation
* recursive agent spawning

Example:

```text
ERROR: Circular delegation

agent-a → agent-b → agent-c → agent-a
```

The generated architecture should be inspectable before execution.

---

# Critical Principle

The project should not be:

> "a framework that forces every model to behave like our agent runtime."

It should instead be:

> **a model/runtime-aware agent architect that generates the best executable agent topology supported by the environment.**

This allows the same project to work with:

```text
single-agent models
        ↓
multi-agent models
        ↓
native sub-agent runtimes
        ↓
agent teams
        ↓
custom orchestration
```

without changing the underlying conceptual model.

# Self-Improving Agents

Self-improvement is a **first-class optional capability** of the system.

The CLI must provide a flag that allows an agent to periodically evaluate and improve itself.

Example:

```bash
agent-builder init --self-improving weekly
```

or:

```bash
agent-builder init --self-improving monthly
```

Also support:

```bash
agent-builder init --self-improving daily
agent-builder init --self-improving weekly
agent-builder init --self-improving monthly
agent-builder init --self-improving quarterly
```

Allow custom schedules where the runtime supports them:

```bash
agent-builder init --self-improving "every 14 days"
```

The exact scheduling syntax should follow the CLI/runtime implementation.

---

# 1. Self-Improvement Is an Agent Lifecycle

A generated agent should not necessarily remain static.

The lifecycle becomes:

```text
                    ┌───────────────┐
                    │   Agent v1    │
                    └───────┬───────┘
                            │
                       scheduled
                            │
                            ▼
                  ┌───────────────────┐
                  │ Improvement Agent │
                  └─────────┬─────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
          New tools      New methods   New knowledge
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                     Evaluate changes
                            │
                            ▼
                       Test / verify
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                  rejected       approved
                     │             │
                     │             ▼
                     │        Agent v2
                     │             │
                     └─────────────┘
```

The improvement process must be inspectable.

---

# 2. What Can Improve

The self-improvement system should evaluate whether the agent can benefit from:

### Knowledge

* new documentation
* new standards
* new research
* new techniques
* new patterns
* newly discovered project information

### Tools

* new CLI tools
* MCP servers
* APIs
* libraries
* developer tools
* context frameworks
* specialized tools

### Reasoning Techniques

* better workflows
* improved decomposition
* improved verification
* improved context retrieval
* improved planning
* improved debugging techniques

### Agent Architecture

* better specialization
* additional sub-agents
* improved delegation
* parallelization
* better handoffs
* improved context boundaries

### Skills

* new Skills
* improved existing Skills
* better references
* better examples
* better validation procedures

### Performance

Where measurable:

* task success rate
* error rate
* failed tool calls
* unnecessary context consumption
* repeated mistakes
* latency
* cost
* validation failures
* user corrections

---

# 3. Improvement Sources

The system should support configurable sources.

For example:

```yaml
self_improvement:
  enabled: true

  schedule: weekly

  sources:
    - documentation
    - research
    - tools
    - standards
    - repository
    - context-frameworks
```

Potential sources include:

```text
official documentation
Git repositories
package registries
standards
technical papers
existing Skills
MCP servers
project history
agent execution history
test results
user feedback
```

Do not blindly trust arbitrary sources.

Source policies should be configurable.

---

# 4. Improvement Agent

Self-improvement should itself be performed by a specialized agent.

Conceptually:

```text
Existing Agent
      │
      │ performance/history
      ▼
Improvement Agent
      │
      ├── Analyze
      ├── Research
      ├── Compare
      ├── Propose
      ├── Test
      └── Validate
             │
             ▼
       Improvement Proposal
```

For complex agents, the improvement process may itself use multiple agents:

```text
Improvement Orchestrator
       │
       ├── Research Agent
       ├── Tool Discovery Agent
       ├── Architecture Reviewer
       ├── Security Reviewer
       └── Evaluation Agent
```

If the underlying runtime supports native multi-agent execution, use it.

---

# 5. Never Silently Mutate by Default

Self-improvement must have explicit policies.

For example:

```bash
--self-improving weekly
```

should not automatically mean:

```text
discover random changes
↓
rewrite agent
↓
deploy
```

Instead the default lifecycle should be:

```text
discover
   ↓
analyze
   ↓
propose
   ↓
test
   ↓
validate
   ↓
approval
   ↓
apply
```

Provide policy modes such as:

```bash
--improvement-policy propose
--improvement-policy auto
--improvement-policy supervised
```

Where:

### propose

Create improvement proposals but do not modify the agent.

### supervised

Prepare changes, run validation, and request approval.

### auto

Automatically apply changes that satisfy predefined safety constraints.

The safest mode should be the default.

---

# 6. Improvement Proposals

Every improvement should produce a structured proposal.

Example:

```yaml
improvement:
  id: imp_2026_001
  agent: production-debugger

  reason:
    - repeated Kubernetes diagnosis failures

  discovery:
    type: technique

  proposal:
    title: Add structured Kubernetes event correlation
    description: ...

  evidence:
    - ...

  affected:
    - skill
    - context
    - workflow

  risk:
    level: low

  tests:
    - ...

  status: proposed
```

Nothing should become an unexplained mutation.

---

# 7. Versioning

Agents must be versioned.

Example:

```text
production-debugger
├── v1.0.0
├── v1.1.0
├── v1.2.0
└── v2.0.0
```

Improvements should produce an explicit diff.

For example:

```text
Agent v1.2 → v1.3

Added:
  + Kubernetes event correlation

Changed:
  ~ incident investigation workflow

Removed:
  - redundant log search step

New dependency:
  + kubectl-events

Reason:
  Improved diagnosis of deployment failures
```

The system should support rollback.

```bash
agent-builder rollback --agent production-debugger
```

---

# 8. Evaluation Before Improvement

An improvement should not be accepted simply because it sounds better.

The system should evaluate it.

Conceptually:

```text
Current Agent
      │
      ▼
Baseline Evaluation
      │
      ▼
Proposed Improvement
      │
      ▼
Evaluation
      │
      ▼
Compare
   /       \
better     worse
  │          │
apply      reject
```

Whenever possible, maintain a regression/evaluation suite.

Example:

```text
Agent Evaluation Suite

✓ debugging incident A
✓ debugging incident B
✓ context retrieval C
✓ security case D
✓ tool-use case E
```

The new version should not regress important capabilities.

---

# 9. Continuous Learning From Failures

The agent should be able to identify repeated failures.

For example:

```text
Execution history:

Incident 1:
  Failed to identify deployment configuration.

Incident 2:
  Failed to identify deployment configuration.

Incident 3:
  Failed to identify deployment configuration.
```

The improvement system derives:

```text
Potential systemic weakness:
Kubernetes deployment configuration is insufficiently represented
in the investigation workflow.
```

Then:

```text
Research
   ↓
Candidate solution
   ↓
Test
   ↓
Proposal
```

Do not automatically convert every failure into a permanent rule.

Repeated failure is evidence, not proof.

---

# 10. New Tools

The improvement system should be able to discover potentially useful tools.

Example:

```text
Current capability:
  Search application logs

New capability discovered:
  Specialized distributed-tracing tool

Question:
  Does this materially improve the agent?

Evaluation:
  Does it improve success rate?
  What permissions does it require?
  What dependencies does it introduce?
  Does it increase cost?
  Does it introduce security risk?
```

Then create a proposal.

Tools must not be installed or granted permissions silently.

---

# 11. New Context Frameworks

Self-improvement should also be able to discover better context systems.

For example:

```text
Current:
  filesystem context

Discovered:
  specialized code-context framework

Evaluation:
  better dependency understanding
  better architecture retrieval
  lower context volume
```

The agent can propose:

```text
Add context framework:
agents-code-context
```

or another compatible framework.

The generic Context Framework interface must make this possible without changing the core.

---

# 12. Self-Improvement Schedule

The CLI should configure a persistent schedule.

Examples:

```bash
agent-builder improve schedule weekly
```

```bash
agent-builder improve schedule monthly
```

```bash
agent-builder improve schedule "every 2 weeks"
```

Inspect:

```bash
agent-builder improve status
```

Example:

```text
Self Improvement

Agent:
  production-debugger

Schedule:
  weekly

Last evaluation:
  2026-09-07

Next evaluation:
  2026-09-14

Pending proposals:
  2

Last applied improvement:
  v1.4.0
```

The actual scheduler should integrate with the environment where the CLI is installed.

Do not require a hosted backend.

Where appropriate, support OS-native scheduling mechanisms.

---

# 13. Scheduled Does Not Mean Always Running

The scheduled process should be lightweight.

A useful lifecycle is:

```text
schedule triggers
       ↓
check whether improvement is needed
       ↓
if no:
    exit
       ↓
if yes:
    research
       ↓
    evaluate
       ↓
    propose
```

Do not consume model/API resources unnecessarily.

---

# 14. Improvement Triggers

Scheduling is not the only trigger.

Support:

```text
time-based
failure-based
performance-based
dependency-based
security-based
tool-discovery-based
knowledge-change-based
manual
```

Example:

```bash
agent-builder improve now
```

or:

```bash
agent-builder improve --reason repeated-failures
```

The system can combine triggers.

---

# 15. Improvement Memory

Maintain an explicit improvement history.

Example:

```text
.improvements/
├── proposals/
│   ├── imp-001.yaml
│   └── imp-002.yaml
├── applied/
│   ├── 2026-09-01-v1.2.md
│   └── 2026-09-08-v1.3.md
├── rejected/
└── evaluations/
```

This allows the agent to understand:

* what it previously tried
* what worked
* what failed
* what was rejected
* why something was rejected

The improvement agent should not repeatedly rediscover rejected ideas without new evidence.

---

# 16. Human Feedback

User corrections should be valuable signals.

Example:

```text
User:
"Don't use that approach. We tried it before."
```

The system can record:

```text
Feedback:
Technique X should not be recommended for this project.

Reason:
Previous attempt failed.

Scope:
Project-specific
```

Do not automatically generalize project-specific feedback into universal agent behavior.

---

# 17. Security Boundary

Self-improvement is potentially dangerous because it introduces a mechanism capable of changing an agent over time.

Therefore:

**Self-improvement must never bypass the agent's permission model.**

An improvement cannot silently:

* expand permissions
* access new secrets
* gain production access
* install arbitrary software
* modify security policies
* disable validation
* remove human approval
* weaken sandboxing
* change safety constraints

An attempted improvement such as:

```text
"Give the agent production write access because it would improve performance."
```

must be treated as a high-risk proposal requiring explicit approval.

---

# 18. Immutable Core Constraints

Separate:

```text
Agent behavior
```

from:

```text
Agent constraints
```

Self-improvement may optimize behavior within constraints.

It must not silently rewrite immutable constraints.

Conceptually:

```text
┌───────────────────────────────┐
│ Security / hard constraints   │
│       IMMUTABLE                │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│ Agent behavior / techniques   │
│       IMPROVABLE               │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│ Tools / context / workflows    │
│       IMPROVABLE               │
└───────────────────────────────┘
```

---

# 19. Self-Improvement Configuration

Support something like:

```yaml
self_improvement:
  enabled: true

  schedule:
    frequency: weekly

  policy:
    mode: supervised

  sources:
    documentation: true
    research: true
    tools: true
    standards: true
    repository: true
    execution_history: true

  allowed_changes:
    skills: true
    workflows: true
    context: true
    tools: true
    agent_topology: true

  protected:
    permissions: true
    secrets: true
    security_constraints: true
    human_approval: true

  evaluation:
    required: true

  rollback:
    enabled: true
```

The exact schema can evolve.

---

# 20. Self-Improving Multi-Agent Teams

For multi-agent systems, self-improvement should evaluate the **team**, not just individual agents.

Example:

```text
Team v2

Orchestrator
├── Research Agent
├── Architecture Agent
├── Implementation Agent
└── Reviewer
```

The improvement engine might discover:

```text
Research and Architecture tasks are independent.
They can execute concurrently.
```

Proposal:

```text
Change:
  sequential → parallel

Expected improvement:
  - latency

Risk:
  low
```

Or:

```text
Repeated failures occur during final validation.

Proposal:
  add dedicated verification agent.
```

Thus self-improvement can change:

* agent roles
* agent count
* delegation
* handoffs
* parallelism
* context routing
* evaluation strategy

while respecting hard constraints.

---

# 21. Improvement Is Evidence-Driven

The core philosophy should be:

> **An agent does not improve because it changed. It improves because evidence shows that the change makes it better.**

Every meaningful improvement should have:

```text
baseline
+
hypothesis
+
change
+
evaluation
+
result
```

Example:

```text
Baseline:
  71% task success

Hypothesis:
  Adding dependency-aware code context improves debugging.

Change:
  Enable context framework X.

Evaluation:
  87% task success

Result:
  +16 percentage points

Decision:
  Apply.
```

Where quantitative evaluation isn't possible, use structured qualitative evidence and clearly mark it as such.

---

# 22. Definition of Done

Self-improvement is complete when a generated agent can:

1. Be configured with a schedule.
2. Wake up on that schedule through a local/runtime mechanism.
3. Inspect its own historical performance.
4. Discover relevant new knowledge, techniques, tools, or context capabilities.
5. Generate improvement hypotheses.
6. Evaluate proposed changes.
7. Produce explicit improvement proposals.
8. Apply approved changes.
9. Version the resulting agent.
10. Preserve an audit trail.
11. Roll back changes.
12. Respect immutable security/permission constraints.
13. Improve individual agents or entire multi-agent teams.

The final system should make this possible:

```bash
agent-builder init \
  --self-improving weekly \
  --context-framework agents-code-context
```

Result:

```text
                    Agent
                      │
                      ▼
              ┌───────────────┐
              │ Execute Tasks │
              └───────┬───────┘
                      │
                 observations
                      │
                      ▼
              ┌───────────────┐
              │ Improvement   │
              │ Agent         │
              └───────┬───────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Research     Tools      Techniques
          │           │           │
          └───────────┼───────────┘
                      ▼
                  Evaluate
                      │
                      ▼
                  Proposal
                      │
                 approval/policy
                      │
                      ▼
                Agent vNext
                      │
                      ▼
                  Rollback
                  if needed
```

The goal is not an agent that blindly rewrites itself.

The goal is:

> **An agent that continuously discovers how it could become better, proves improvements where possible, and evolves under explicit constraints.**

Yes — **multiple specialized agents are included**, but I would strengthen the prompt to explicitly support **native multi-agent models/runtime capabilities**.

The distinction should be:

1. **Agent suite** — multiple specialized agents can exist.
2. **Agent orchestration** — agents can delegate to/invoke other agents.
3. **Model-native multi-agent capability** — if the underlying model/runtime supports subagents, parallel agents, handoffs, etc., use those capabilities instead of reinventing them.
4. **Fallback** — if the model doesn't support native multi-agent execution, the CLI/Skill should provide a compatible orchestration layer.

I'd add this section to the prompt:

# Multi-Agent Runtime & Model Capability

Multi-agent support is a **first-class requirement**.

The system must not assume that every model has the same agent capabilities.

Detect and expose the capabilities available in the current runtime/model environment.

Conceptually:

```text
Model / Runtime Capabilities
│
├── single-agent
├── sub-agents
├── parallel agents
├── agent handoffs
├── agent delegation
├── tool-use
├── persistent agents
└── agent teams
```

The architecture must adapt to these capabilities.

## Capability Detection

Provide a capability model such as:

```json
{
  "multi_agent": true,
  "sub_agents": true,
  "parallel_execution": true,
  "handoffs": true,
  "delegation": true
}
```

Do not hard-code these capabilities to a particular provider.

The capability layer should be provider/runtime agnostic.

---

## Native First

If the current model or coding-agent runtime supports native subagents, teams, delegation, parallel execution, or handoffs:

**use the native mechanism first.**

Do not unnecessarily recreate a parallel-agent system inside the CLI.

The project should act as an orchestration/specification layer that understands what the runtime can do.

For example:

```text
Agent Builder
      │
      ▼
Capability Detection
      │
      ├── Native multi-agent available
      │       ↓
      │   Use native runtime
      │
      └── Not available
              ↓
          CLI fallback
```

---

# Agent Graph

The generated specification should support an agent graph rather than only a flat list.

Example:

```text
                    Orchestrator
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
         Research     Architect    Security
             │           │           │
             └───────────┼───────────┘
                         ▼
                    Implementer
                         │
                         ▼
                       Tester
                         │
                         ▼
                      Reviewer
```

The graph should support:

* sequential execution
* parallel execution
* delegation
* handoffs
* dependencies
* conditional routing
* aggregation
* review
* escalation to human
* retry/replanning

---

# Agent Definition

Each agent should be independently defined:

```yaml
agent:
  id: architecture-agent
  role: architecture
  purpose: ...
  capabilities:
    - repository-analysis
    - architecture-design

  inputs:
    - requirements
    - research

  outputs:
    - architecture-spec

  context:
    scopes:
      - architecture
      - source

  permissions:
    read:
      - repository

    write: []

  delegates:
    - research-agent

  handoff:
    to:
      - implementation-agent
```

The exact format can be JSON/YAML/etc., but the semantic model must support these relationships.

---

# Parallel Agents

When the runtime supports parallel execution, the planner should be able to determine that independent tasks can execute concurrently.

Example:

```text
                    Orchestrator
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          Research    Security    Architecture
              │          │          │
              └──────────┼──────────┘
                         ▼
                     Synthesis
```

The orchestrator should not serialize work unnecessarily.

However, parallel execution must only occur when dependencies permit it.

---

# Context Isolation

Multi-agent execution must preserve the information-firewall principle.

Do NOT create:

```text
Global Context
     ↓
Every Agent
```

Instead:

```text
                Context Framework
                       │
                Relevant Context
                       │
                 Orchestrator
                /      |       \
               /       |        \
              ▼        ▼         ▼
          Agent A   Agent B   Agent C
             │        │          │
             ▼        ▼          ▼
          scoped    scoped     scoped
          context   context    context
```

Each agent should receive only the context required for its task.

Agent outputs should become explicit artifacts that can be selectively passed to other agents.

---

# Agent Handoffs

Support explicit handoffs.

Example:

```text
Research Agent
      ↓
Research Artifact
      ↓
Architecture Agent
```

The Architecture Agent should receive the research artifact, not necessarily the Research Agent's entire internal context.

A handoff should specify:

```json
{
  "from": "research-agent",
  "to": "architecture-agent",
  "artifacts": [
    "research-report"
  ],
  "context_scope": [
    "architecture-relevant"
  ]
}
```

---

# Agent Teams

The system should support defining teams of specialized agents.

Example:

```text
team:
  name: software-engineering
  coordinator: architect
  members:
    - researcher
    - architect
    - implementer
    - tester
    - reviewer
```

Teams may be dynamically generated by the progressive specification process.

For example, the user starts with:

```text
"I need an agent that analyzes complex production bugs."
```

The system may determine that the required solution is actually:

```text
production-debugging-team
├── incident-researcher
├── code-analysis-agent
├── infrastructure-agent
├── hypothesis-agent
└── reviewer
```

This decision should emerge from requirements rather than from a fixed template.

---

# Dynamic Agent Creation

The system must be able to determine that a single agent is insufficient.

The progressive questioning process should therefore evaluate:

```text
Can one agent reliably perform this task?
```

If not:

```text
What responsibilities should be separated?
```

Then derive specialized agents.

For example:

```text
Complex task
     ↓
Decompose responsibilities
     ↓
Identify independent capabilities
     ↓
Create specialized agents
     ↓
Define dependencies
     ↓
Define communication artifacts
     ↓
Define orchestration
```

---

# Model-Aware Planning

The final agent specification should contain the runtime requirements.

Example:

```yaml
runtime:
  requirements:
    multi_agent: true
    parallel_execution: true
    handoffs: true
```

If the selected runtime does not support a required capability, the validator should report:

```text
UNSUPPORTED CAPABILITY

This agent architecture requires:
  ✓ multi-agent
  ✓ handoffs
  ✓ parallel execution

Current runtime:
  ✓ multi-agent
  ✗ parallel execution

Options:
  1. Enable a compatible runtime
  2. Serialize the workflow
  3. Re-plan the agent architecture
```

The system should never silently pretend that a runtime supports a capability it does not actually provide.

---

# Provider/Runtime Adapters

Keep runtime-specific behavior behind adapters.

Conceptually:

```text
Runtime Interface
       │
       ├── Native Runtime A
       ├── Native Runtime B
       ├── Coding Agent Runtime
       └── Generic CLI Runtime
```

The core agent specification remains provider-neutral.

A provider/runtime adapter translates:

```text
Agent Graph
     ↓
Runtime-specific representation
```

---

# Fallback Mode

If no native multi-agent capability exists, provide a deterministic fallback where practical.

For example:

```text
Orchestrator CLI
      ↓
spawn agent
      ↓
collect artifact
      ↓
spawn next agent
      ↓
collect artifact
      ↓
synthesize
```

Do not require a hosted service for this.

The fallback should work locally whenever the underlying environment permits it.

---

# Multi-Agent Validation

Validate:

* circular dependencies
* missing agents
* invalid handoffs
* unavailable capabilities
* excessive context sharing
* conflicting permissions
* missing outputs
* impossible dependencies
* unsupported parallelism
* orphaned agents
* unbounded delegation
* recursive agent spawning

Example:

```text
ERROR: Circular delegation

agent-a → agent-b → agent-c → agent-a
```

The generated architecture should be inspectable before execution.

---

# Critical Principle

The project should not be:

> "a framework that forces every model to behave like our agent runtime."

It should instead be:

> **a model/runtime-aware agent architect that generates the best executable agent topology supported by the environment.**

This allows the same project to work with:

```text
single-agent models
        ↓
multi-agent models
        ↓
native sub-agent runtimes
        ↓
agent teams
        ↓
custom orchestration
```

without changing the underlying conceptual model.

That makes the **multi-agent capability dynamic**: if a model/runtime can natively spawn or coordinate agents, we leverage it; if not, we degrade gracefully. It also means the progressive questioning engine can conclude that **the correct answer isn't one specialized agent, but a team of specialized agents**.
