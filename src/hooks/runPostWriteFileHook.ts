import type { Task } from "../core/task/Task"
import { appendAgentTraceForWrite } from "../services/TraceService"
import { updateIntentMapForWrite } from "../services/orchestration/intentMapService"
import { HookManager } from "./HookManager"

type RunPostWriteFileHookInput = {
	relativePath: string
	intentId: string
	mutationClass: "AST_REFACTOR" | "INTENT_EVOLUTION"
	newContent: string
	previousContent?: string
}

type PostWriteHookContext = {
	task: Task
	input: RunPostWriteFileHookInput
}

type PostWriteHookResult = {
	intentMapMessage?: string
}

const postWriteHookManager = new HookManager<PostWriteHookContext, PostWriteHookResult>()

postWriteHookManager
	.register({
		id: "trace-serialization",
		criticality: "best_effort",
		run: async ({ task, input }) => {
			await appendAgentTraceForWrite({
				workspaceRoot: task.cwd,
				relativePath: input.relativePath,
				taskId: task.taskId,
				modelIdentifier: task.api.getModel().id,
				intentId: input.intentId,
				mutationClass: input.mutationClass,
			})

			return {}
		},
	})
	.register({
		id: "intent-map-update",
		criticality: "best_effort",
		run: async ({ task, input }) => {
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
		},
	})

export async function runPostWriteFileHook(
	task: Task,
	input: RunPostWriteFileHookInput,
): Promise<{ intentMapMessage?: string }> {
	const results = await postWriteHookManager.execute({ task, input })
	const intentMapMessage = results.find((result) => result.intentMapMessage)?.intentMapMessage

	return {
		intentMapMessage,
	}
}
