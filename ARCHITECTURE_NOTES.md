# ARCHITECTURE_NOTES

## 1) Objective

Build a governed AI-native IDE extension that guarantees **Intent → Action → Code Traceability**.

The extension must:

- enforce intent selection before any mutating operation,
- apply deterministic Pre/Post tool hooks as middleware,
- keep immutable sidecar trace records for auditing,
- support human-in-the-loop (HITL) authorization and multi-agent safety.

---

## 2) Architectural Principles

1. **Intent First, Code Second**
    - Agent cannot mutate files until it declares an active intent.
2. **Deterministic Governance**
    - Enforce behavior with hard middleware hooks, not prompt-only instructions.
3. **Separation of Privileges**
    - Webview = presentation only; Extension Host = execution and secrets.
4. **Trace by Construction**
    - Every write operation must generate attribution data automatically.
5. **Spatially Independent Attribution**
    - Store content hashes for edited snippets so trace survives line movement.
6. **Safe Concurrency**
    - Use optimistic locking and scope boundaries to avoid overwrite collisions.

---

## 3) High-Level Topology

### 3.1 Layers

- **Webview UI (Restricted)**

    - Chat rendering, artifact rendering, approvals UI.
    - No direct filesystem/terminal/provider access.
    - Communicates via `postMessage`.

- **Extension Host (Trusted Runtime)**

    - Provider/model orchestration, MCP client, tool routing, secret handling.
    - Owns all governance checks and policy decisions.

- **Hook Engine (Middleware Boundary)**

    - Wraps all tool calls (`PreToolUse`, `PostToolUse`, failures).
    - Performs intent validation, scope checks, command risk checks, HITL gating.
    - Emits structured tool errors for autonomous recovery.

- **Orchestration Sidecar Store (`.orchestration/`)**
    - Machine-managed state and ledger files.
    - Source of truth for intent + trace metadata.

### 3.2 Trust Boundary

- Untrusted: prompt content, workspace text, external MCP outputs.
- Trusted logic: hook policies in extension host.
- Any destructive action must cross policy gate + optional human approval.

---

## 4) Deterministic Turn State Machine

For each user turn, enforce two-stage handshake before mutation:

1. **Request Intake**

    - User asks for work (e.g., refactor auth middleware).

2. **Reasoning Intercept (Handshake)**

    - Agent must call `select_active_intent(intent_id)` first.
    - Pre-hook validates `intent_id` exists and is active.
    - Hook loads intent constraints/scope/recent trace context.
    - Hook returns `<intent_context>...</intent_context>` as tool result.

3. **Contextualized Execution**
    - Agent performs read/analysis and proposes/executes edits.
    - For writes, pre-hook enforces scope + concurrency + risk policy.
    - Post-hook serializes trace record and updates sidecar docs.

If handshake is skipped, block with deterministic error:

- `You must cite a valid active Intent ID before mutating tools.`

---

## 5) Required Data Model (`.orchestration/`)

### 5.1 `active_intents.yaml`

Purpose: lifecycle of active business intents.

Minimum fields:

- `id`, `name`, `status`
- `owned_scope[]` (glob paths)
- `constraints[]`
- `acceptance_criteria[]`

Used by:

- Pre-hook validation,
- scope authorization,
- context injection.

### 5.2 `agent_trace.jsonl`

Purpose: append-only ledger mapping intent/spec to concrete code mutations.

Each JSON line should include:

- `id` (uuid), `timestamp` (RFC3339), `vcs.revision_id`
- `files[].relative_path`
- `conversations[].url`
- `conversations[].contributor.{entity_type, model_identifier}`
- `ranges[].{start_line,end_line,content_hash}`
- `related[]` containing requirement/spec/intents IDs

Guarantees:

- immutable append-only writes,
- schema-valid records,
- one or more records per mutating operation.

### 5.3 `intent_map.md`

Purpose: human-readable map from business intent to code locations/AST anchors.

Update on `INTENT_EVOLUTION` or scope changes.

### 5.4 `AGENT.md` / `CLAUDE.md` (Shared Brain)

Purpose: persistent cross-session memory:

- architectural decisions,
- lessons learned,
- recurring failure patterns and fixes.

---

## 6) Hook Engine Policy Model

### 6.1 PreToolUse Policies

1. **Intent Presence Gate**
    - Required for any mutating tool (`write`, `delete`, `execute`).
2. **Intent Validity Gate**
    - `intent_id` must exist and be active.
3. **Scope Gate**
    - Target path must match `owned_scope` globs.
4. **Risk Classification Gate**
    - `SAFE` vs `DESTRUCTIVE` commands.
5. **HITL Gate (for destructive ops)**
    - block and require Approve/Reject.
6. **Optimistic Lock Gate**
    - compare observed file hash vs current hash before write.

### 6.2 PostToolUse Policies

1. **Trace Serialization**
    - Build Agent Trace entry and append to `agent_trace.jsonl`.
2. **Semantic Mutation Classification**
    - `AST_REFACTOR` vs `INTENT_EVOLUTION`.
3. **Artifact/Doc Maintenance**
    - update `intent_map.md` and shared brain where applicable.
4. **Quality Loop Integration**
    - run formatter/linter/test hooks; feed failures back as structured context.

### 6.3 Error Contract

All blocked actions return machine-readable errors, for example:

```json
{
	"error_code": "SCOPE_VIOLATION",
	"message": "Scope Violation: INT-001 is not authorized to edit src/payments/index.ts",
	"recoverable": true,
	"required_action": "Request scope expansion or choose a valid intent"
}
```

---

## 7) Tooling & MCP Integration

Implement MCP client in extension host to discover and route tools dynamically.

Recommended capability groups:

- **Specification Discovery**: read and parse spec/intents files.
- **Workspace Interaction**: bounded file operations in allowed roots.
- **Validation/Actuation**: formatter, type-check, tests.

Do not expose unrestricted shell/file capabilities directly to model context.

---

## 8) Concurrency Model (Multi-Agent Safe)

1. **Write Partitioning Preferred**
    - assign disjoint files/scopes to concurrent agents.
2. **Optimistic Locking Required**
    - stale-write detection via pre/post content hashes.
3. **Patch-Oriented Edits Preferred**
    - avoid full-file rewrites when targeted patch is possible.
4. **Supervisor-Worker Pattern**
    - supervisor tracks global intent; workers receive narrowed scope and compact context.

On stale file:

- reject write,
- return `STALE_FILE` tool error,
- force re-read/rebase.

---

## 9) Security & Governance Guardrails

- Strict path normalization and traversal prevention.
- Command sanitization and shell argument quoting.
- Least-privilege tool permissions by default.
- Circuit breaker for repeated failed autonomous loops.
- Explicit user approvals for destructive actions.

---

## 10) Suggested Repository Placement (for this codebase)

- `src/hooks/`

    - `hookEngine.ts` (dispatcher)
    - `policies/intentPolicy.ts`
    - `policies/scopePolicy.ts`
    - `policies/riskPolicy.ts`
    - `policies/lockingPolicy.ts`
    - `serialization/traceSerializer.ts`
    - `context/intentContextLoader.ts`
    - `errors/toolErrors.ts`

- `src/shared/orchestration/`

    - `types.ts` (intent + trace schema types)
    - `hash.ts` (SHA-256 content hashing)
    - `sidecarStore.ts` (atomic read/append/write)

- Workspace artifacts
    - `.orchestration/active_intents.yaml`
    - `.orchestration/agent_trace.jsonl`
    - `.orchestration/intent_map.md`
    - `AGENT.md` (or `CLAUDE.md`)

---

## 11) Acceptance Criteria

1. Agent cannot perform mutating action before valid `select_active_intent` handshake.
2. Out-of-scope writes are blocked with deterministic recovery error.
3. Every successful mutation appends valid JSONL trace containing:
    - intent/spec reference,
    - contributor metadata,
    - content hash,
    - VCS revision.
4. Destructive commands require explicit user approval.
5. Stale writes are detected and rejected under concurrent modification.
6. Shared brain and intent map update incrementally as governance artifacts.

---

## 12) Minimal Demo Script

1. Create `.orchestration/active_intents.yaml` with `INT-001`.
2. Ask agent to refactor a scoped file.
3. Verify handshake call occurs (`select_active_intent`).
4. Verify file edit succeeds and `agent_trace.jsonl` appends with `content_hash`.
5. Attempt out-of-scope edit; verify policy block.
6. Trigger parallel modification and verify stale-write rejection.

---

## 13) Non-Goals (MVP)

- Full AST differencing engine (optional enhancement).
- Distributed multi-machine orchestration.
- Replacing Git; this augments Git with intent/trace sidecar metadata.

---

## 14) Summary

This architecture transforms the extension from a probabilistic code assistant into a **governed execution platform**. The Hook Engine is the control plane, `.orchestration/` is the memory/ledger plane, and intent handshake + trace serialization establish end-to-end accountability from requirement to code mutation.
