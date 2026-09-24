/**
 * Errors the data layer raises on purpose. Anything else is a bug.
 *
 * Kept distinct so a server action can turn each into the right response —
 * a 404 for a missing event, a refusal for a forbidden one — without
 * catching and hiding everything else.
 */

/** The row does not exist, OR the actor may not know it exists. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found.`);
    this.name = 'NotFoundError';
  }
}

/** The actor is known and the row exists, but this is not theirs to change. */
export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** The request is well-formed but conflicts with the current state. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Input that fails validation, in words the organizer can act on. */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}
