import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION = `Select the active intent before any mutating action. This is mandatory for intent-governed execution.

Protocol:
1) Analyze the user request.
2) Call select_active_intent with a valid intent_id from active_intents.yaml.
3) Wait for <intent_context> tool result.
4) Only then proceed with mutating tools.

If no valid intent exists yet, ask the user for clarification or propose creating one.`

const INTENT_ID_PARAMETER_DESCRIPTION = `The active intent ID to load (for example: INT-001)`

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: INTENT_ID_PARAMETER_DESCRIPTION,
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
