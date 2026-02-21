# Intent Map

## Phase 1 — Setup

| Task | Story | Target file(s)                                                                                     | Primary AST node(s)                                                                                                     |
| ---- | ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| T001 | Setup | `specs/1-influencer-factory/contracts/`; specs/1-influencer-factory/contracts/feature/openapi.yaml | N/A (directory scaffold)                                                                                                |
| T002 | Setup | `src/lib/config.py`; `src/lib/logging.py`; src/lib/config.py; src/lib/logging.py                   | `FactoryConfig`; `load_factory_env()`; `TraceContextFilter`; `configure_structured_logging()`; Config; StructuredLogger |
| T004 | Setup | `tests/conftest.py`; tests/conftest.py                                                             | `pytest_configure(config)`                                                                                              |
| T005 | Setup | `README.md`                                                                                        | N/A (Markdown sections/commands)                                                                                        |

## Phase 2 — Foundational

| Task | Story      | Target file(s)                                               | Primary AST node(s)                                                                 |
| ---- | ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| T006 | Foundation | `src/schemas/task_envelope.py`; src/schemas/task_envelope.py | `TaskEnvelope`; `TaskMeta`; `validate_task_envelope()`; TaskEnvelope                |
| T007 | Foundation | `src/schemas/worker_output.py`                               | `WorkerOutput`; `OutputMetadata`; `validate_worker_output()`                        |
| T008 | Foundation | `src/schemas/judge_result.py`                                | `JudgeResult`; `validate_judge_result()`                                            |
| T009 | Foundation | `src/repositories/base_repository.py`                        | `BaseRepository`; `get_connection()`; `execute()`                                   |
| T010 | Foundation | `src/repositories/tasks_repository.py`                       | `TasksRepository`; `create_task()`; `update_task_status()`; `attach_trace_fields()` |
| T011 | Foundation | `src/repositories/assets_repository.py`                      | `AssetsRepository`; `store_asset()`; `store_vector()`                               |
| T012 | Foundation | `src/adapters/mcp_client.py`                                 | `MCPClient` (Protocol/ABC); `MCPRequest`; `MCPResponse`                             |
| T013 | Foundation | `src/adapters/search_adapter.py`                             | `SearchAdapter`; `fetch_trends()`                                                   |
| T014 | Foundation | `src/adapters/wallet_adapter.py`                             | `WalletAdapter`; `provision_wallet()`; `prepare_tx()`; `submit_tx()`                |
| T015 | Foundation | `src/adapters/openclaw_adapter.py`                           | `OpenClawAdapter`; `publish_asset()`                                                |
| T016 | Foundation | `src/lib/errors.py`                                          | `ErrorEnvelope`; `to_error_envelope()`; `deterministic_error_code()`                |
| T017 | Foundation | `src/lib/telemetry.py`                                       | `TelemetryEmitter`; `emit_event()`; `required_trace_fields`                         |

## Phase 3 — Implementation

| Task | Story  | Target file(s)                                   | Primary AST node(s)                                      |
| ---- | ------ | ------------------------------------------------ | -------------------------------------------------------- |
| T018 | US1    | `tests/test_trend_fetcher.py`                    | `test_trend_fetcher_top10_vectors()`                     |
| T019 | US1    | `tests/contract/test_trend_fetcher_contract.py`  | `test_trend_ingestion_envelope_contract()`               |
| T020 | US1    | `src/models/trend.py`                            | `Trend`; `TrendVector`; `rank_trends()`                  |
| T021 | US1    | `src/worker/trend_fetcher.py`                    | `trend_fetcher()`; `fetch_trends_from_search_adapter()`  |
| T022 | US1    | `src/planner/trend_planner.py`                   | `TrendPlanner`; `plan_trend_discovery()`                 |
| T023 | US1    | `src/repositories/assets_repository.py`          | `AssetsRepository.persist_trend_vectors()`               |
| T024 | US1    | `src/lib/telemetry.py`                           | `log_trend_request_trace()`                              |
| T025 | US2    | `tests/contract/test_planner_tasks_contract.py`  | `test_post_planner_tasks_envelope_contract()`            |
| T026 | US2    | `tests/integration/test_planner_routing.py`      | `test_planner_task_routing()`                            |
| T027 | US2    | `src/models/planner_task.py`                     | `PlannerTask`; `build_task_envelope()`                   |
| T028 | US2    | `src/planner/task_service.py`                    | `TaskService`; `enqueue_task()`; `compute_deadline()`    |
| T029 | US2    | `src/planner/api.py`                             | `create_planner_task_handler()`                          |
| T030 | US2    | `src/repositories/tasks_repository.py`           | `TasksRepository.persist_task_with_trace()`              |
| T031 | US2    | `src/planner/router.py`                          | `ROLE_SKILL_MAP`; `route_task_to_skill()`                |
| T032 | US3    | `tests/integration/test_worker_mcp_only.py`      | `test_worker_external_calls_use_adapters_only()`         |
| T033 | US3    | `tests/unit/test_worker_stateless.py`            | `test_worker_execution_is_stateless()`                   |
| T034 | US3    | `src/worker/task_executor.py`                    | `TaskExecutor`; `execute_task()`                         |
| T035 | US3    | `src/worker/adapter_policy.py`                   | `AdapterPolicyGuard`; `enforce_mcp_only()`               |
| T036 | US3    | `src/worker/error_mapper.py`                     | `map_worker_error()`                                     |
| T037 | US3    | `src/lib/telemetry.py`                           | `log_worker_execution_trace()`                           |
| T038 | US4    | `tests/test_skills_interface.py`                 | `test_skills_interface_structured_output()`              |
| T039 | US4    | `tests/contract/test_worker_output_contract.py`  | `test_worker_output_schema_contract()`                   |
| T040 | US4    | `src/worker/skills_interface.py`                 | `build_skill_output()`; `skills_interface()`             |
| T041 | US4    | `src/schemas/worker_output.py`                   | `validate_worker_output()` (integration point)           |
| T042 | US4    | `src/worker/api.py`                              | `submit_worker_result_handler()`                         |
| T043 | US5    | `tests/unit/test_judge_soul_rules.py`            | `test_soul_rule_violations_rejected()`                   |
| T044 | US5    | `tests/integration/test_judge_verdicts.py`       | `test_judge_verdict_pipeline()`                          |
| T045 | US5    | `src/judge/soul_rules.py`                        | `SoulRule`; `load_soul_rules()`; `parse_soul_md()`       |
| T046 | US5    | `src/judge/evaluator.py`                         | `JudgeEvaluator`; `evaluate_output()`                    |
| T047 | US5    | `src/judge/api.py`                               | `create_judge_verdict_handler()`                         |
| T048 | US5    | `src/repositories/tasks_repository.py`           | `TasksRepository.persist_judge_verdict_metadata()`       |
| T049 | US6    | `tests/unit/test_judge_schema_validation.py`     | `test_schema_type_rejections()`                          |
| T050 | US6    | `tests/contract/test_judge_contract.py`          | `test_judge_rejection_reasons_contract()`                |
| T051 | US6    | `src/judge/schema_validator.py`                  | `SchemaValidator`; `validate_worker_payload_schema()`    |
| T052 | US6    | `src/judge/evaluator.py`                         | `JudgeEvaluator._validate_schema_gate()`                 |
| T053 | US6    | `src/judge/rejection_codes.py`                   | `RejectionCode` (Enum); `CANONICAL_REJECTION_CODES`      |
| T054 | US7    | `tests/contract/test_hitl_contract.py`           | `test_post_hitl_reviews_contract()`                      |
| T055 | US7    | `tests/integration/test_hitl_flow.py`            | `test_hitl_escalation_and_callback()`                    |
| T056 | US7    | `src/models/hitl_review.py`                      | `HitlReviewRequest`; `HitlReviewFeedback`                |
| T057 | US7    | `src/hitl/review_service.py`                     | `ReviewService`; `enqueue_review()`; `submit_feedback()` |
| T058 | US7    | `src/hitl/api.py`                                | `create_hitl_review_handler()`                           |
| T059 | US7    | `src/planner/feedback_ingest.py`                 | `ingest_hitl_feedback()`                                 |
| T060 | Polish | `tests/integration/test_openclaw_publish.py`     | `test_openclaw_publish_flow()`                           |
| T061 | Polish | `tests/integration/test_wallet_provisioning.py`  | `test_wallet_provisioning_and_sense_recording()`         |
| T062 | Polish | `tests/contract/test_mcp_adapter_enforcement.py` | `test_ci_worker_calls_are_adapter_mediated()`            |
| T063 | Polish | `tests/unit/test_telemetry_fields.py`            | `test_required_observability_fields_present()`           |
| T064 | Polish | `specs/1-influencer-factory/quickstart.md`       | N/A (Markdown validation steps section)                  |
| T065 | Polish | `specs/1-influencer-factory/plan.md`             | N/A (Markdown implementation notes section)              |
