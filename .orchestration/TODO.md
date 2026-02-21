# Tasks: Autonomous Influencer Factory

**Input**: Design documents from `/specs/1-influencer-factory/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Included and required for initial slices per spec (`T-001` trend_fetcher, `T-002` skills_interface).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (`US1`..`US7`)
- All tasks include exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize repo-level tooling and feature scaffolding.

- [x] T001 Create feature directory contracts scaffold in specs/1-influencer-factory/contracts/
- [x] T002 [P] Add factory environment variables template in src/lib/config.py & Add structured logging bootstrap with trace fields in src/lib/logging.py
- [x] T004 [P] Add pytest markers for contract/integration/unit in tests/conftest.py
- [x] T005 Add feature quickstart command references in README.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core foundations required by all stories before implementation.

**⚠️ CRITICAL**: Complete before any user-story implementation.

- [x] T006 Create shared task envelope schema models in src/schemas/task_envelope.py
- [ ] T007 [P] Create shared worker output schema models in src/schemas/worker_output.py
- [ ] T008 [P] Create shared judge result schema models in src/schemas/judge_result.py
- [ ] T009 Create PostgreSQL repository base for tasks/assets tables in src/repositories/base_repository.py
- [ ] T010 [P] Implement task persistence repository in src/repositories/tasks_repository.py
- [ ] T011 [P] Implement asset persistence repository in src/repositories/assets_repository.py
- [ ] T012 Implement MCP adapter client interface contracts in src/adapters/mcp_client.py
- [ ] T013 [P] Implement search adapter wrapper in src/adapters/search_adapter.py
- [ ] T014 [P] Implement wallet adapter wrapper in src/adapters/wallet_adapter.py
- [ ] T015 [P] Implement openclaw adapter wrapper in src/adapters/openclaw_adapter.py
- [ ] T016 Implement deterministic error envelope utilities in src/lib/errors.py
- [ ] T017 Implement telemetry emitter for spec/task/role/trace logging in src/lib/telemetry.py

**Checkpoint**: Foundations complete; user stories can proceed.

---

## Phase 3: User Story 1 - Planner trend discovery (Priority: P1) 🎯 MVP

**Goal**: Planner discovers ranked trends by niche/platform with velocity and vectors.

**Independent Test**: Running trend fetcher tests returns non-empty ranked top-10 results with numeric velocity scores and vectors.

### Tests for User Story 1

- [ ] T018 [P] [US1] Add fail-first unit test for trend_fetcher top-10 vectors in tests/test_trend_fetcher.py
- [ ] T019 [P] [US1] Add contract test for trend ingestion request/response envelope in tests/contract/test_trend_fetcher_contract.py

### Implementation for User Story 1

- [ ] T020 [P] [US1] Implement trend domain model with velocity fields in src/models/trend.py
- [ ] T021 [US1] Implement trend_fetcher worker skill using search adapter in src/worker/trend_fetcher.py
- [ ] T022 [US1] Implement planner trend orchestration method in src/planner/trend_planner.py
- [ ] T023 [US1] Persist trend vectors and metadata in assets repository path src/repositories/assets_repository.py
- [ ] T024 [US1] Add planner trace logging for trend requests in src/lib/telemetry.py

**Checkpoint**: US1 is independently testable and meets SC-001 slice behavior.

---

## Phase 4: User Story 2 - Planner task orchestration (Priority: P1)

**Goal**: Planner emits correctly routed task envelopes with deadlines and required inputs.

**Independent Test**: Planner task creation persists `spec_id`, `task_id`, `role`, `trace_id`, and routes to expected worker skill.

### Tests for User Story 2

- [ ] T025 [P] [US2] Add contract test for POST /planner/tasks envelope in tests/contract/test_planner_tasks_contract.py
- [ ] T026 [P] [US2] Add integration test for planner task routing in tests/integration/test_planner_routing.py

### Implementation for User Story 2

- [ ] T027 [P] [US2] Implement planner task model helpers in src/models/planner_task.py
- [ ] T028 [US2] Implement planner task service for enqueue/deadline handling in src/planner/task_service.py
- [ ] T029 [US2] Implement planner tasks API handler in src/planner/api.py
- [ ] T030 [US2] Persist planner tasks with traceability fields in src/repositories/tasks_repository.py
- [ ] T031 [US2] Add worker-skill routing map for planner roles in src/planner/router.py

**Checkpoint**: US2 is independently testable with schema-compliant task envelopes.

---

## Phase 5: User Story 3 - Worker stateless MCP execution (Priority: P1)

**Goal**: Worker executes tasks statelessly and only via MCP adapters.

**Independent Test**: Worker execution path invokes only adapter wrappers and emits machine-readable errors when adapter operations fail.

### Tests for User Story 3

- [ ] T032 [P] [US3] Add integration test asserting worker external calls use adapters only in tests/integration/test_worker_mcp_only.py
- [ ] T033 [P] [US3] Add unit test for stateless worker execution context in tests/unit/test_worker_stateless.py

### Implementation for User Story 3

- [ ] T034 [P] [US3] Implement stateless task executor core in src/worker/task_executor.py
- [ ] T035 [US3] Implement adapter dispatch policy guard in src/worker/adapter_policy.py
- [ ] T036 [US3] Implement worker error translation to deterministic envelope in src/worker/error_mapper.py
- [ ] T037 [US3] Add worker execution telemetry with required trace fields in src/lib/telemetry.py

**Checkpoint**: US3 is independently testable and satisfies MCP-only integration constraints.

---

## Phase 6: User Story 4 - Worker structured content outputs (Priority: P1)

**Goal**: Worker returns schema-valid structured outputs for downstream Judge validation.

**Independent Test**: Worker results contain required keys (`task_id`, `status`, `output`, `metadata`) and consistent error shape.

### Tests for User Story 4

- [ ] T038 [P] [US4] Add fail-first test for skills_interface structured output in tests/test_skills_interface.py
- [ ] T039 [P] [US4] Add contract test for worker output schema in tests/contract/test_worker_output_contract.py

### Implementation for User Story 4

- [ ] T040 [P] [US4] Implement skills_interface worker skill output builder in src/worker/skills_interface.py
- [ ] T041 [US4] Implement output schema validator integration in src/schemas/worker_output.py
- [ ] T042 [US4] Implement worker result submission handler for POST /worker/tasks/{task_id}/result in src/worker/api.py

**Checkpoint**: US4 is independently testable and aligns with `T-002` output requirements.

---

## Phase 7: User Story 5 - Judge SOUL compliance validation (Priority: P1)

**Goal**: Judge validates outputs against SOUL rules and returns deterministic verdicts.

**Independent Test**: SOUL-violating content is rejected with deterministic reasons; compliant outputs include confidence score.

### Tests for User Story 5

- [ ] T043 [P] [US5] Add unit tests for SOUL rule violations in tests/unit/test_judge_soul_rules.py
- [ ] T044 [P] [US5] Add integration test for judge verdict pipeline in tests/integration/test_judge_verdicts.py

### Implementation for User Story 5

- [ ] T045 [P] [US5] Implement SOUL rule loader/parser in src/judge/soul_rules.py
- [ ] T046 [US5] Implement judge evaluator with deterministic reasons in src/judge/evaluator.py
- [ ] T047 [US5] Implement judge verdict API handler for POST /judge/tasks/{task_id}/verdict in src/judge/api.py
- [ ] T048 [US5] Persist judge verdict metadata linked to task trace in src/repositories/tasks_repository.py

**Checkpoint**: US5 is independently testable and enforces persona integrity from SOUL.md.

---

## Phase 8: User Story 6 - Judge schema compliance enforcement (Priority: P2)

**Goal**: Judge rejects malformed worker outputs and type mismatches before propagation.

**Independent Test**: Missing required fields and invalid types always produce rejection with canonical reasons.

### Tests for User Story 6

- [ ] T049 [P] [US6] Add unit tests for schema/type rejection paths in tests/unit/test_judge_schema_validation.py
- [ ] T050 [P] [US6] Add contract test for judge rejection reasons format in tests/contract/test_judge_contract.py

### Implementation for User Story 6

- [ ] T051 [P] [US6] Implement judge schema validation module in src/judge/schema_validator.py
- [ ] T052 [US6] Integrate schema validator into judge evaluator pipeline in src/judge/evaluator.py
- [ ] T053 [US6] Add canonical rejection reason constants in src/judge/rejection_codes.py

**Checkpoint**: US6 is independently testable and blocks invalid outputs from downstream use.

---

## Phase 9: User Story 7 - Human HITL review workflow (Priority: P2)

**Goal**: Route low-confidence/indeterminate outputs to HITL with context and captured feedback.

**Independent Test**: Human review tasks include context/diff/reason and feedback returns to Planner loop.

### Tests for User Story 7

- [ ] T054 [P] [US7] Add contract test for POST /hitl/reviews in tests/contract/test_hitl_contract.py
- [ ] T055 [P] [US7] Add integration test for human_review escalation and callback in tests/integration/test_hitl_flow.py

### Implementation for User Story 7

- [ ] T056 [P] [US7] Implement HITL review request model in src/models/hitl_review.py
- [ ] T057 [US7] Implement HITL queue/review service in src/hitl/review_service.py
- [ ] T058 [US7] Implement HITL API handler for review creation in src/hitl/api.py
- [ ] T059 [US7] Implement planner feedback ingestion from HITL outcomes in src/planner/feedback_ingest.py

**Checkpoint**: US7 is independently testable with end-to-end escalation and planner feedback loop.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Hardening across all implemented stories.

- [ ] T060 [P] Add OpenClaw publish flow integration test in tests/integration/test_openclaw_publish.py
- [ ] T061 [P] Add wallet provisioning + Sense recorder integration test in tests/integration/test_wallet_provisioning.py
- [ ] T062 Add CI check ensuring worker external calls are MCP adapter mediated in tests/contract/test_mcp_adapter_enforcement.py
- [ ] T063 Add observability field completeness assertions in tests/unit/test_telemetry_fields.py
- [ ] T064 Update feature quickstart validation steps in specs/1-influencer-factory/quickstart.md
- [ ] T065 Update feature docs references and implementation notes in specs/1-influencer-factory/plan.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **Phases 3–9 (User Stories)**: Depend on Phase 2 completion.
- **Phase 10 (Polish)**: Depends on completed target user stories.

### User Story Dependency Graph

- **US1 (P1)**: Depends on Phase 2 only.
- **US2 (P1)**: Depends on Phase 2 only.
- **US3 (P1)**: Depends on US2 routing and Phase 2 adapter interfaces.
- **US4 (P1)**: Depends on US3 executor baseline.
- **US5 (P1)**: Depends on US4 structured outputs and SOUL artifacts.
- **US6 (P2)**: Depends on US5 evaluator pipeline.
- **US7 (P2)**: Depends on US5 verdict semantics (`human_review`) and US2 planner feedback routing.

Recommended delivery order:

1. US1 → 2. US2 → 3. US3 → 4. US4 → 5. US5 → 6. US6 → 7. US7

### Within Each User Story

- Tests first and fail-first where specified.
- Models/schemas before services.
- Services before API handlers.
- Persist/telemetry integration before story completion.

---

## Parallel Opportunities

- Setup tasks marked `[P]`: T002–T004.
- Foundational tasks marked `[P]`: T007, T010, T011, T013, T014, T015.
- US1 parallel: T018/T019 tests and T020 model.
- US2 parallel: T025/T026 tests and T027 model.
- US3 parallel: T032/T033 tests and T034 core executor.
- US4 parallel: T038/T039 tests and T040 implementation.
- US5 parallel: T043/T044 tests and T045 rule loader.
- US6 parallel: T049/T050 tests and T051 validator.
- US7 parallel: T054/T055 tests and T056 model.
- Polish parallel: T060, T061, T063.

---

## Parallel Example: User Story 1

```bash
Task: "T018 [US1] tests/test_trend_fetcher.py"
Task: "T019 [US1] tests/contract/test_trend_fetcher_contract.py"
Task: "T020 [US1] src/models/trend.py"
```

## Parallel Example: User Story 2

```bash
Task: "T025 [US2] tests/contract/test_planner_tasks_contract.py"
Task: "T026 [US2] tests/integration/test_planner_routing.py"
Task: "T027 [US2] src/models/planner_task.py"
```

## Parallel Example: User Story 3

```bash
Task: "T032 [US3] tests/integration/test_worker_mcp_only.py"
Task: "T033 [US3] tests/unit/test_worker_stateless.py"
Task: "T034 [US3] src/worker/task_executor.py"
```

## Parallel Example: User Story 4

```bash
Task: "T038 [US4] tests/test_skills_interface.py"
Task: "T039 [US4] tests/contract/test_worker_output_contract.py"
Task: "T040 [US4] src/worker/skills_interface.py"
```

## Parallel Example: User Story 5

```bash
Task: "T043 [US5] tests/unit/test_judge_soul_rules.py"
Task: "T044 [US5] tests/integration/test_judge_verdicts.py"
Task: "T045 [US5] src/judge/soul_rules.py"
```

## Parallel Example: User Story 6

```bash
Task: "T049 [US6] tests/unit/test_judge_schema_validation.py"
Task: "T050 [US6] tests/contract/test_judge_contract.py"
Task: "T051 [US6] src/judge/schema_validator.py"
```

## Parallel Example: User Story 7

```bash
Task: "T054 [US7] tests/contract/test_hitl_contract.py"
Task: "T055 [US7] tests/integration/test_hitl_flow.py"
Task: "T056 [US7] src/models/hitl_review.py"
```

---

## Implementation Strategy

### MVP First (Recommended Scope)

1. Complete Phase 1 and Phase 2.
2. Deliver US1 (trend discovery) and validate independently.
3. Deliver US2 + US3 + US4 to make Planner/Worker flow operational.
4. Deliver US5 for SOUL-governed acceptance.

### Incremental Delivery

1. Foundation complete.
2. Add one user story phase at a time in priority order.
3. Validate each story independently before moving on.
4. Finish with Phase 10 cross-cutting hardening.

### Parallel Team Strategy

1. Team-wide completion of Phase 1–2.
2. Then split by stories where dependencies allow:
    - Stream A: US1 → US2
    - Stream B: US3 → US4
    - Stream C: US5 → US6/US7

---

## Notes

- All external integrations remain MCP adapter mediated.
- Judge tasks preserve deterministic accept/reject/human_review semantics.
- Wallet/Sense governance tasks are included in story flow and polish checks.
