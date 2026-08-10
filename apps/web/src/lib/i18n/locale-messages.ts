/** Widen string leaves so locales can differ; keep formatter arity. */
export type LocaleMessages<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => unknown
    ? (...args: A) => string
    : string
}
