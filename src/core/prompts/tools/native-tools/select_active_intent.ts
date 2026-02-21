import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description:
			"Call this tool to set the current requirement you are working on. This must be done before using any implementation tools like write_to_file.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: "Intent ID to activate (for example: INT-001)",
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
