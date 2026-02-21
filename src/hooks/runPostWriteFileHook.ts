import type { Task } from "../core/task/Task"
import { appendAgentTraceForWrite } from "../services/TraceService"
import { updateIntentMapForWrite } from "../services/orchestration/intentMapService"

type RunPostWriteFileHookInput = {
	relativePath: string
	intentId: string
	mutationClass: "AST_REFACTOR" | "INTENT_EVOLUTION"
	newContent: string
	previousContent?: string
}

export async function runPostWriteFileHook(
	task: Task,
	input: RunPostWriteFileHookInput,
): Promise<{ intentMapMessage?: string }> {
	await appendAgentTraceForWrite({
		workspaceRoot: task.cwd,
		relativePath: input.relativePath,
		taskId: task.taskId,
		modelIdentifier: task.api.getModel().id,
		intentId: input.intentId,
		mutationClass: input.mutationClass,
	})

	const intentMapUpdate = await updateIntentMapForWrite({
		workspaceRoot: task.cwd,
		intentId: input.intentId,
		relativePath: input.relativePath,
		mutationClass: input.mutationClass,
		newContent: input.newContent,
		previousContent: input.previousContent,
		taskContext: task.metadata.task,
	})

	return {
		intentMapMessage: intentMapUpdate.message,
	}
}
