export type HookCriticality = "critical" | "best_effort"

export type RegisteredHook<TContext, TResult = void> = {
	id: string
	criticality: HookCriticality
	run: (context: TContext) => Promise<TResult>
}

export class HookManager<TContext, TResult = void> {
	private readonly hooks: RegisteredHook<TContext, TResult>[] = []

	register(hook: RegisteredHook<TContext, TResult>): this {
		this.hooks.push(hook)
		return this
	}

	async execute(context: TContext): Promise<TResult[]> {
		const results: TResult[] = []

		for (const hook of this.hooks) {
			try {
				results.push(await hook.run(context))
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				if (hook.criticality === "critical") {
					throw new Error(`[Hook:${hook.id}] ${message}`)
				}

				console.warn(`[HookManager] best_effort hook failed: ${hook.id}`, error)
			}
		}

		return results
	}
}
