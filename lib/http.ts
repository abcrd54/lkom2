export function jsonOk(data: unknown, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function jsonError(message: string, status = 400) {
  return Response.json(
    {
      ok: false,
      error: message
    },
    { status }
  );
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unexpected error.";
}
