export type BackendErrorKind =
  | 'validation'
  | 'resource_not_found'
  | 'unauthorized'
  | 'graphql'
  | 'network'
  | 'unknown';

export class BackendError extends Error {
  readonly kind: BackendErrorKind;
  readonly code?: number;
  readonly type?: string;
  readonly detail?: string;
  readonly raw?: unknown;

  constructor(args: {
    message: string;
    kind: BackendErrorKind;
    code?: number;
    type?: string;
    detail?: string;
    raw?: unknown;
  }) {
    super(args.message);
    this.name = 'BackendError';
    this.kind = args.kind;
    this.code = args.code;
    this.type = args.type;
    this.detail = args.detail;
    this.raw = args.raw;
  }
}

/**
 * Hasura trigger errors follow:
 *   [422] VALIDATION_ERROR: Insufficient stock ... - Details
 *   [404] RESOURCE_NOT_FOUND: ...
 */
export function parseHasuraErrorMessage(message: string): {
  code?: number;
  type?: string;
  detail?: string;
} {
  const match = message.match(/^\[(\d+)\]\s+([A-Z_]+):\s+(.+)$/);
  if (!match) return {};
  const code = Number(match[1]);
  const type = match[2];
  const detail = match[3];
  return {
    code: Number.isFinite(code) ? code : undefined,
    type,
    detail,
  };
}

export function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

  const parsed = parseHasuraErrorMessage(message);
  if (parsed.type === 'VALIDATION_ERROR') {
    return new BackendError({
      message: parsed.detail ?? message,
      kind: 'validation',
      code: parsed.code,
      type: parsed.type,
      detail: parsed.detail,
      raw: error,
    });
  }
  if (parsed.type === 'RESOURCE_NOT_FOUND') {
    return new BackendError({
      message: parsed.detail ?? message,
      kind: 'resource_not_found',
      code: parsed.code,
      type: parsed.type,
      detail: parsed.detail,
      raw: error,
    });
  }

  // Heuristics for auth/network
  const lower = message.toLowerCase();
  if (lower.includes('jwt') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return new BackendError({ message, kind: 'unauthorized', raw: error });
  }
  if (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('socket')
  ) {
    return new BackendError({ message: 'Network error. Please try again.', kind: 'network', raw: error });
  }

  return new BackendError({ message, kind: 'unknown', raw: error });
}

export function toUserMessage(err: BackendError): string {
  if (err.kind === 'validation' || err.kind === 'resource_not_found') return err.message;
  if (err.kind === 'unauthorized') return 'Session expired. Please login again.';
  if (err.kind === 'network') return err.message;
  return err.message || 'Something went wrong. Please try again.';
}

