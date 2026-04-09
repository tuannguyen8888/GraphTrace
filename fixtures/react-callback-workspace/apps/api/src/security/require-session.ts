export function requireSession<TRequest, TResponse>(
  handler: (
    request: TRequest,
    response: TResponse,
  ) => Promise<unknown> | unknown,
) {
  return async function wrappedSessionHandler(
    request: TRequest,
    response: TResponse,
  ) {
    return handler(request, response);
  };
}
