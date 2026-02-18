import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { selectActiveIntent } from "../../hooks/intentHooks"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface SelectActiveIntentParams {
	intent_id: string
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		const intentId = params.intent_id

		if (!intentId) {
			task.consecutiveMistakeCount++
			task.recordToolError("select_active_intent")
			pushToolResult("You must cite a valid active Intent ID.")
			return
		}

		try {
			const { xmlContext } = await selectActiveIntent(task, intentId)
			task.consecutiveMistakeCount = 0
			pushToolResult(xmlContext)
		} catch (error) {
			task.consecutiveMistakeCount++
			task.recordToolError("select_active_intent")
			await handleError("selecting active intent", error as Error)
		}
	}

	override async handlePartial(_task: Task, _block: ToolUse<"select_active_intent">): Promise<void> {
		return
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
