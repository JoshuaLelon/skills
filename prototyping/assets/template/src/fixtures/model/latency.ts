// HOW LONG THE CALL TAKES — the one part of a canned answer that must not be
// free.
//
// A mock that answers instantly makes every waiting state in the app dead code:
// the pending row, the disabled primary action, the thing marked as being
// replaced. None of them can be walked, so nobody can say whether they read.
// The prototype exists to be walked, so the wait is part of what it mocks.
//
// It goes at the port with everything else in this directory: the real call
// brings its own latency, and `think` is deleted with the data it delays.
//
// A flow test moves the browser clock through these delays with
// `page.clock.runFor`, exactly as it does for a toast countdown. No test sleeps,
// and no test waits in real seconds.
//
// DELETE THIS FILE, AND `fixtures/model/`, if the prototype stands in for no
// call. Nothing outside the directory refers to either.

// TWO WAITS, AND THEY ARE DIFFERENT EXPERIENCES — not two settings of one.
// Pick by what the walker DOES during the wait, never by how slow the real call
// is thought to be. They were 400ms apart, which is close enough that both read
// as one pause and the distinction below was invisible in the walk.

/** THE PAUSE INSIDE A STEP YOU ARE STANDING IN. You watch it: the spinner is in
 *  front of you, the primary action is disabled, and you do nothing else until
 *  it answers. A model reply, a third-party lookup. */
export const A_BEAT = 1200

/** WORK THAT LEAVES AND COMES BACK AS A ROW IN YOUR DAY. You start it and carry
 *  on; it lands somewhere you are not looking, and you find it. It must be long
 *  enough to read as gone-away-and-come-back — a wait you sit through is the
 *  other constant — and short enough to walk repeatedly. */
export const A_WHILE = 4000

/** Hand back the canned answer after `ms`, the way a call hands back a real
 *  one: asynchronously, and never the fixture object itself. Cloning is what a
 *  call does — a caller given the module's own object could freeze it, and the
 *  next call would then return something the first one had touched. */
export const think = <T>(answer: T, ms: number = A_BEAT): Promise<T> =>
	new Promise((resolve) => setTimeout(() => resolve(structuredClone(answer)), ms))
