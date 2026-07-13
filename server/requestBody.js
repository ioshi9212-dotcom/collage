export class RequestBodyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'RequestBodyError';
    this.status = status;
    this.code = code;
  }
}

function positiveByteLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 1;
}

function payloadTooLargeError(limitBytes) {
  return new RequestBodyError(
    413,
    'payload_too_large',
    `Размер запроса превышает допустимый лимит ${limitBytes} байт.`,
  );
}

export function readJsonBody(request, limitBytes) {
  const limit = positiveByteLimit(limitBytes);

  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    let settled = false;

    const rejectOnce = (error, drain = false) => {
      if (settled) return;
      settled = true;
      chunks = [];
      reject(error);
      if (drain && typeof request.resume === 'function') request.resume();
    };

    request.on('data', (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;

      if (size > limit) {
        rejectOnce(payloadTooLargeError(limit), true);
        return;
      }

      chunks.push(buffer);
    });

    request.on('end', () => {
      if (settled) return;
      settled = true;

      if (size === 0) {
        resolve({});
        return;
      }

      const text = Buffer.concat(chunks, size).toString('utf8');
      chunks = [];
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new RequestBodyError(400, 'invalid_json', 'Тело запроса содержит некорректный JSON.'));
      }
    });

    request.on('error', (error) => rejectOnce(error));

    const declaredLength = Number(request.headers?.['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      rejectOnce(payloadTooLargeError(limit), true);
    }
  });
}
