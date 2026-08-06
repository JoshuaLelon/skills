// The client half of the error taxonomy (ADR-0008) — identical in shape to
// production's: expected states throw AppError and render in the boundary.
// Production adds guarded() on top; this is what accessors and clientLoaders throw.
export class AppError extends Error {
  readonly status: number
  readonly publicMessage: string
  constructor(status: number, publicMessage: string) {
    super(publicMessage)
    this.name = 'AppError'
    this.status = status
    this.publicMessage = publicMessage
  }
}

export const notFound = (what = 'Not found') => new AppError(404, what)
export const forbidden = (why = 'Not allowed') => new AppError(403, why)
