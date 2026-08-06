// The one door to the model (ADR-0012 seam 4, gated by one-door-model): the
// app talks capability (TextGenerator), never provider. Echo by default so the
// seam exercises without a key; the real SDK loads lazily behind the env var.
export interface GenerationRequest {
	purpose: string // entity/verb-ish, e.g. 'note/suggest-title'
	prompt: string // already-constructed semantic request — prompt building is pure
}

export interface GeneratedText {
	text: string
	model: string
}

export function makeTextGenerator(env: Env): (req: GenerationRequest) => Promise<GeneratedText> {
	if (!env.ANTHROPIC_API_KEY) {
		return async (req) => ({
			text: `[echo:${req.purpose}] ${req.prompt.slice(0, 80)}`,
			model: 'echo',
		})
	}
	return async (req) => {
		const { default: Anthropic } = await import('@anthropic-ai/sdk')
		const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
		const res = await client.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 256,
			messages: [{ role: 'user', content: req.prompt }],
		})
		const text = res.content.find((b) => b.type === 'text')?.text ?? ''
		// Provider DTOs stop HERE — our type crosses the door, theirs does not.
		return { text, model: res.model }
	}
}
