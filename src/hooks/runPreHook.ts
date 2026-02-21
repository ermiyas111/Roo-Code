import type { Task } from "../core/task/Task"
import {
	getCurrentActiveIntent,
	markRequirementCompletedInTodo,
	removeActiveIntent,
	upsertActiveIntent,
} from "../services/orchestration/activeIntentService"

type RunPreHookInput = {
	toolName: string
	toolCallId?: string
	isPartial?: boolean
}

const IMPLEMENTATION_TOOLS = new Set([
	"write_to_file",
	"execute_command",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
])

export async function runPreHook(cline: Task, input: RunPreHookInput): Promise<void> {
	if (input.isPartial) {
		return
	}

	const workspaceRoot = cline.cwd
	const activeIntent = await getCurrentActiveIntent(workspaceRoot)

	if (!activeIntent && IMPLEMENTATION_TOOLS.has(input.toolName)) {
		throw new Error("You must cite a valid active Intent ID.")
	}

	if (activeIntent) {
		const baseIntentUpdate = {
			...activeIntent,
			task_id: cline.taskId,
			task: cline.metadata.task ?? "",
			tool_name: input.toolName,
			tool_call_id: input.toolCallId ?? null,
			updated_at: new Date().toISOString(),
		}

		await upsertActiveIntent(workspaceRoot, {
			...baseIntentUpdate,
		})

		if (input.toolName === "attempt_completion") {
			await markRequirementCompletedInTodo(workspaceRoot, activeIntent.id)
			await upsertActiveIntent(workspaceRoot, {
				...baseIntentUpdate,
				status: "COMPLETED",
				updated_at: new Date().toISOString(),
			})
			await removeActiveIntent(workspaceRoot, activeIntent.id)
		}
	}
}
