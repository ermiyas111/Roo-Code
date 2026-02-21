import type { ToolName } from "@roo-code/types"

export type ToolRiskClass = "SAFE" | "DESTRUCTIVE" | "OTHER"

const SAFE_TOOLS = new Set<ToolName>(["read_file", "list_files", "list_code_definition_names", "search_files"])

const DESTRUCTIVE_TOOLS = new Set<ToolName>(["write_to_file", "execute_command", "apply_diff", "insert_content"])

export function classifyToolRisk(toolName: string): ToolRiskClass {
	if (SAFE_TOOLS.has(toolName as ToolName)) {
		return "SAFE"
	}

	if (DESTRUCTIVE_TOOLS.has(toolName as ToolName)) {
		return "DESTRUCTIVE"
	}

	return "OTHER"
}

export function isDestructiveTool(toolName: string): boolean {
	return classifyToolRisk(toolName) === "DESTRUCTIVE"
}
