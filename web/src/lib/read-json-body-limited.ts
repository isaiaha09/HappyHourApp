export type LimitedJsonBodyResult =
  | { kind: "ok"; value: unknown }
  | { kind: "invalid" }
  | { kind: "too-large" };

/** Enforce a byte limit while reading a JSON request stream. */
export async function readJsonBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<LimitedJsonBodyResult> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null && /^\d+$/.test(contentLengthHeader)) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > maxBytes) {
      void request.body?.cancel().catch(() => undefined);
      return { kind: "too-large" };
    }
  }

  if (!request.body) {
    return { kind: "invalid" };
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { kind: "invalid" };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      if (totalBytes + value.byteLength > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }

      totalBytes += value.byteLength;
      chunks.push(value.slice());
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { kind: "ok", value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { kind: "invalid" };
  }
}
