import type { ActiveIntent } from "../../services/orchestration/activeIntentService"
import { runPreHook } from "../runPreHook"
import {
	getCurrentActiveIntent,
	markRequirementCompletedInTodo,
	upsertActiveIntent,
} from "../../services/orchestration/activeIntentService"

vi.mock("../../services/orchestration/activeIntentService", () => ({
	getCurrentActiveIntent: vi.fn(),
	markRequirementCompletedInTodo: vi.fn(),
	upsertActiveIntent: vi.fn(),
}))

describe("runPreHook", () => {
	const mockedGetCurrentActiveIntent = getCurrentActiveIntent as unknown as ReturnType<typeof vi.fn>
	const mockedMarkRequirementCompletedInTodo = markRequirementCompletedInTodo as unknown as ReturnType<typeof vi.fn>
	const mockedUpsertActiveIntent = upsertActiveIntent as unknown as ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("marks active intent COMPLETED on attempt_completion", async () => {
		const activeIntent: ActiveIntent = {
			id: "INT-001",
			name: "Intent 1",
			status: "IN_PROGRESS",
			owned_scope: ["src/"],
			constraints: ["constraint"],
			acceptance_criteria: ["done"],
			requirement_id: "T001",
		}

		mockedGetCurrentActiveIntent.mockResolvedValue(activeIntent)
		mockedUpsertActiveIntent.mockResolvedValue({ path: "", intent: activeIntent })
		mockedMarkRequirementCompletedInTodo.mockResolvedValue(undefined)

		const task = {
			cwd: "/workspace",
			taskId: "task-123",
			metadata: { task: "Finish feature" },
		} as any

		await runPreHook(task, {
			toolName: "attempt_completion",
			toolCallId: "tool-abc",
			isPartial: false,
		})

		expect(mockedMarkRequirementCompletedInTodo).toHaveBeenCalledWith("/workspace", "INT-001")
		expect(mockedUpsertActiveIntent).toHaveBeenCalledTimes(2)
		const secondCall = mockedUpsertActiveIntent.mock.calls[1]?.[1]
		expect(secondCall.status).toBe("COMPLETED")
		expect(secondCall.tool_name).toBe("attempt_completion")
	})

	it("throws when implementation tool has no active intent", async () => {
		mockedGetCurrentActiveIntent.mockResolvedValue(undefined)

		const task = {
			cwd: "/workspace",
			taskId: "task-123",
			metadata: { task: "Implement feature" },
		} as any

		await expect(
			runPreHook(task, {
				toolName: "write_to_file",
				toolCallId: "tool-abc",
				isPartial: false,
			}),
		).rejects.toThrow("You must cite a valid active Intent ID.")
	})
})
