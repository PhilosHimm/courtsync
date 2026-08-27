/**
 * Thrown by functions that are declared but not yet implemented.
 *
 * Nothing throws this today — every scheduling function is implemented and
 * every spec suite runs. It stays because it is half of the convention in
 * CLAUDE.md for adding one: declare the function throwing this with a pointer
 * to its spec, write the spec as a `describe.skip` suite, then un-skip,
 * implement, and delete the throw.
 */
export class NotImplementedError extends Error {
  constructor(fn: string, specPath: string) {
    super(
      `${fn} is not implemented. Its specification is in ${specPath} — un-skip that suite and make it pass.`,
    );
    this.name = 'NotImplementedError';
  }
}
