import type { Task } from "../core/task/Task"
import { appendAgentTraceForWrite } from "../services/TraceService"

type RunPostWriteFileHookInput = {
	relativePath: string
	intentId: string
	mutationClass: "AST_REFACTOR" | "INTENT_EVOLUTION"
}

export async function runPostWriteFileHook(task: Task, input: RunPostWriteFileHookInput): Promise<void> {
	await appendAgentTraceForWrite({
		workspaceRoot: task.cwd,
		relativePath: input.relativePath,
		taskId: task.taskId,
		modelIdentifier: task.api.getModel().id,
		intentId: input.intentId,
		mutationClass: input.mutationClass,
	})
}
