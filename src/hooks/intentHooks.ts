import * as fs from "fs/promises"
import * as path from "path"
import * as yaml from "yaml"

import type { ToolName } from "@roo-code/types"

type IntentTaskRef = { cwd: string }

type ActiveIntent = {
	id: string
	name?: string
	status?: string
	owned_scope?: string[]
	constraints?: string[]
}

type ParsedActiveIntents = {
	active_intents: ActiveIntent[]
}

type IntentSelectionState = {
	intentId: string
	xmlContext: string
	consolidatedContext: string
}

type ToolGateResult = {
	allowed: boolean
	error?: string
}

const INTENT_REQUIRED_ERROR = "You must cite a valid active Intent ID."

const MUTATING_TOOLS_REQUIRING_INTENT = new Set<ToolName>([
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"execute_command",
	"generate_image",
])

const selectionStore = new WeakMap<object, IntentSelectionState>()

function xmlEscape(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
}

async function readActiveIntents(cwd: string): Promise<ParsedActiveIntents> {
	const filePath = path.join(cwd, ".orchestration", "active_intents.yaml")
	const raw = await fs.readFile(filePath, "utf-8")
	const parsed = yaml.parse(raw) as ParsedActiveIntents | null
	const intents = Array.isArray(parsed?.active_intents) ? parsed.active_intents : []
	return { active_intents: intents }
}

async function readRelatedTraceLines(cwd: string, intentId: string): Promise<string[]> {
	const tracePath = path.join(cwd, ".orchestration", "agent_trace.jsonl")
	try {
		const raw = await fs.readFile(tracePath, "utf-8")
		return raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.filter((line) => line.includes(intentId))
			.slice(-20)
	} catch {
		return []
	}
}

function buildIntentXml(intent: ActiveIntent): string {
	const constraints = Array.isArray(intent.constraints) ? intent.constraints : []
	const scope = Array.isArray(intent.owned_scope) ? intent.owned_scope : []

	const constraintsXml = constraints
		.map((constraint) => `    <constraint>${xmlEscape(String(constraint))}</constraint>`)
		.join("\n")
	const scopeXml = scope.map((item) => `    <path>${xmlEscape(String(item))}</path>`).join("\n")

	return [
		"<intent_context>",
		`  <intent_id>${xmlEscape(intent.id)}</intent_id>`,
		"  <constraints>",
		constraintsXml || "    <constraint></constraint>",
		"  </constraints>",
		"  <owned_scope>",
		scopeXml || "    <path></path>",
		"  </owned_scope>",
		"</intent_context>",
	].join("\n")
}

function buildConsolidatedContext(intent: ActiveIntent, relatedTraceLines: string[]): string {
	const constraints = Array.isArray(intent.constraints) ? intent.constraints : []
	const scope = Array.isArray(intent.owned_scope) ? intent.owned_scope : []
	const traceSummary = relatedTraceLines.length
		? relatedTraceLines.map((line) => `- ${line.slice(0, 240)}`).join("\n")
		: "- No related trace entries found."

	return [
		"<intent_runtime_context>",
		`<intent_id>${xmlEscape(intent.id)}</intent_id>`,
		"<constraints>",
		...constraints.map((constraint) => `- ${constraint}`),
		"</constraints>",
		"<owned_scope>",
		...scope.map((item) => `- ${item}`),
		"</owned_scope>",
		"<recent_agent_trace>",
		traceSummary,
		"</recent_agent_trace>",
		"</intent_runtime_context>",
	].join("\n")
}

async function resolveIntent(cwd: string, intentId: string): Promise<ActiveIntent | undefined> {
	try {
		const { active_intents } = await readActiveIntents(cwd)
		return active_intents.find((intent) => intent.id === intentId)
	} catch {
		return undefined
	}
}

export async function selectActiveIntent(task: IntentTaskRef, intentId: string): Promise<{ xmlContext: string }> {
	if (!intentId) {
		throw new Error(INTENT_REQUIRED_ERROR)
	}

	const intent = await resolveIntent(task.cwd, intentId)
	if (!intent) {
		throw new Error(INTENT_REQUIRED_ERROR)
	}

	const relatedTraceLines = await readRelatedTraceLines(task.cwd, intentId)
	const xmlContext = buildIntentXml(intent)
	const consolidatedContext = buildConsolidatedContext(intent, relatedTraceLines)

	selectionStore.set(task as object, {
		intentId,
		xmlContext,
		consolidatedContext,
	})

	return { xmlContext }
}

export async function runIntentGate(task: IntentTaskRef, toolName: ToolName): Promise<ToolGateResult> {
	if (!MUTATING_TOOLS_REQUIRING_INTENT.has(toolName)) {
		return { allowed: true }
	}

	const selection = selectionStore.get(task as object)
	if (!selection?.intentId) {
		return { allowed: false, error: INTENT_REQUIRED_ERROR }
	}

	const intent = await resolveIntent(task.cwd, selection.intentId)
	if (!intent) {
		return { allowed: false, error: INTENT_REQUIRED_ERROR }
	}

	return { allowed: true }
}

export function getIntentContextForPrompt(task: IntentTaskRef): string | undefined {
	const selection = selectionStore.get(task as object)
	if (!selection) {
		return undefined
	}
	return selection.consolidatedContext
}

export function getIntentGateErrorMessage(): string {
	return INTENT_REQUIRED_ERROR
}
