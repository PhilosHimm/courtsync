/**
 * Thrown by functions that are declared but not yet implemented.
 *
 * Every one of these has a corresponding `describe.skip` suite in `test/`
 * that already specifies the required behaviour. The implementation task is
 * always: un-skip the suite, make it pass, delete the throw.
 */
export class NotImplementedError extends Error {
  constructor(fn: string, specPath: string) {
    super(
      `${fn} is not implemented. Its specification is in ${specPath} — un-skip that suite and make it pass.`,
    );
    this.name = 'NotImplementedError';
  }
}
