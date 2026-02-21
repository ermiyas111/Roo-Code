import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import {
	normalizeIntentId,
	verifyIntentExistsInTodo,
	readSpecIntentDetails,
	upsertActiveIntent,
	getRequirementIdForIntent,
} from "../../services/orchestration/activeIntentService"

interface SelectActiveIntentParams {
	intent_id: string
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		if (!params.intent_id) {
			task.consecutiveMistakeCount++
			task.recordToolError("select_active_intent")
			pushToolResult(await task.sayAndCreateMissingParamError("select_active_intent", "intent_id"))
			return
		}

		const intentId = normalizeIntentId(params.intent_id)
		const workspaceRoot = task.cwd

		const { exists } = await verifyIntentExistsInTodo(workspaceRoot, intentId)
		if (!exists) {
			task.consecutiveMistakeCount++
			task.recordToolError("select_active_intent")
			pushToolResult(
				formatResponse.toolError(
					`Intent ${intentId} was not found in .orchestration/TODO.md. Select an intent that exists in the current TODO list.`,
				),
			)
			return
		}

		const specDetails = await readSpecIntentDetails(workspaceRoot, intentId)
		const requirementId = getRequirementIdForIntent(intentId)

		await upsertActiveIntent(workspaceRoot, {
			id: intentId,
			name: specDetails.name,
			status: "IN_PROGRESS",
			owned_scope: specDetails.owned_scope,
			constraints: specDetails.constraints,
			acceptance_criteria: specDetails.acceptance_criteria,
			requirement_id: requirementId ?? null,
			task_id: task.taskId,
			task: task.metadata.task ?? "",
			tool_name: "select_active_intent",
			updated_at: new Date().toISOString(),
		})

		pushToolResult(formatResponse.toolResult(`Intent ${intentId} is now active. Context loader initialized.`))
	}

	override async handlePartial(task: Task, block: ToolUse<"select_active_intent">): Promise<void> {
		const intentId = block.params.intent_id ?? ""
		await task.ask("tool", JSON.stringify({ tool: "selectActiveIntent", intentId }), block.partial).catch(() => {})
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
