// Pure. Never imports the view or the framework — the gate enforces it.
export type Fx = { fx: string } & Record<string, unknown>

export interface State {
	seq: number
	hideDone: boolean
	_fx: Fx[]
}

export function freshState(): State {
	return { seq: 0, hideDone: false, _fx: [] }
}

export type Action = { type: 'ui/toggle-done' }

export function reducer(s: State, a: Action): State {
	switch (a.type) {
		case 'ui/toggle-done':
			return { ...s, seq: s.seq + 1, hideDone: !s.hideDone }
	}
}
