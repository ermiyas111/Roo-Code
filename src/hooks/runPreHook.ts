import type { Task } from "../core/task/Task"
import { getRecentIntentTraceSummary } from "../services/TraceService"
import { enforceGovernanceForTool } from "../services/GovernanceService"
import {
	getCurrentActiveIntent,
	markRequirementCompletedInTodo,
	upsertActiveIntent,
} from "../services/orchestration/activeIntentService"
import type { ToolParamName } from "../shared/tools"

type RunPreHookInput = {
	toolName: string
	toolParams?: Partial<Record<ToolParamName, string>>
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
	"insert_content",
])

export async function runPreHook(cline: Task, input: RunPreHookInput): Promise<void> {
	if (input.isPartial) {
		return
	}

	if (input.toolName === "select_active_intent") {
		return
	}

	const workspaceRoot = cline.cwd
	const activeIntent = await getCurrentActiveIntent(workspaceRoot)

	if (!activeIntent && IMPLEMENTATION_TOOLS.has(input.toolName)) {
		throw new Error("You must cite a valid active Intent ID.")
	}

	await enforceGovernanceForTool({
		task: cline,
		toolName: input.toolName,
		toolParams: input.toolParams,
		activeIntent,
	})

	if (activeIntent) {
		const traceSummary = await getRecentIntentTraceSummary(workspaceRoot, activeIntent.id)
		if (traceSummary) {
			cline.userMessageContent.unshift({
				type: "text",
				text: traceSummary,
			})
		}

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
		}
	}
}
