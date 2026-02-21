import fs from "fs/promises"
import os from "os"
import path from "path"

import { updateIntentMapForWrite } from "../intentMapService"

describe("intentMapService", () => {
	let workspaceRoot: string

	beforeEach(async () => {
		workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "roo-intent-map-"))
		await fs.mkdir(path.join(workspaceRoot, ".orchestration"), { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(workspaceRoot, { recursive: true, force: true })
	})

	it("updates intent map for INTENT_EVOLUTION and appends target files and AST nodes", async () => {
		await fs.writeFile(
			path.join(workspaceRoot, ".orchestration", "active_intents.yaml"),
			`active_intents:\n  - id: INT-001\n    name: Feature intent\n    status: IN_PROGRESS\n    owned_scope:\n      - src/services/\n`,
			"utf-8",
		)
		await fs.writeFile(path.join(workspaceRoot, "Tasks.md"), "- [ ] T001 Build feature service", "utf-8")

		const result = await updateIntentMapForWrite({
			workspaceRoot,
			intentId: "INT-001",
			relativePath: "src/services/FeatureService.ts",
			mutationClass: "INTENT_EVOLUTION",
			newContent:
				"export class FeatureService {}\nexport interface FeatureContract {}\nexport function buildFeature() {}\nconst API_TIMEOUT = 1000\n",
			previousContent: "",
			taskContext: "Build feature service",
		})

		expect(result.message).toContain("Intent Map updated: Added")

		const mapContent = await fs.readFile(path.join(workspaceRoot, ".orchestration", "intent_map.md"), "utf-8")
		expect(mapContent).toContain("## Phase 2 — Foundational")
		expect(mapContent).toContain("| Task | Story | Target file(s) | Primary AST node(s) |")
		expect(mapContent).toContain("| T001 | Foundation |")
		expect(mapContent).toContain("src/services/FeatureService.ts")
		expect(mapContent).toContain("FeatureService")
		expect(mapContent).toContain("FeatureContract")
		expect(mapContent).toContain("buildFeature")
		expect(mapContent).toContain("API_TIMEOUT")
	})

	it("reconstructs map when file is corrupted and avoids duplicate entries", async () => {
		await fs.writeFile(
			path.join(workspaceRoot, ".orchestration", "active_intents.yaml"),
			`active_intents:\n  - id: INT-002\n    name: Refactor intent\n    status: IN_PROGRESS\n    owned_scope:\n      - src/core/\n`,
			"utf-8",
		)
		await fs.writeFile(path.join(workspaceRoot, "Tasks.md"), "- [ ] T002 Improve architecture", "utf-8")
		await fs.writeFile(path.join(workspaceRoot, ".orchestration", "intent_map.md"), "corrupted-table", "utf-8")

		await updateIntentMapForWrite({
			workspaceRoot,
			intentId: "INT-002",
			relativePath: "src/core/Architect.ts",
			mutationClass: "INTENT_EVOLUTION",
			newContent: "export function evolveArchitecture() {}\n",
			previousContent: "",
		})

		await updateIntentMapForWrite({
			workspaceRoot,
			intentId: "INT-002",
			relativePath: "src/core/Architect.ts",
			mutationClass: "INTENT_EVOLUTION",
			newContent: "export function evolveArchitecture() {}\n",
			previousContent: "",
		})

		const mapContent = await fs.readFile(path.join(workspaceRoot, ".orchestration", "intent_map.md"), "utf-8")
		expect(mapContent).toContain("T002")

		const targetOccurrences = (mapContent.match(/src\/core\/Architect\.ts/g) || []).length
		expect(targetOccurrences).toBe(1)

		const nodeOccurrences = (mapContent.match(/evolveArchitecture/g) || []).length
		expect(nodeOccurrences).toBe(1)
	})
})
