export class WellhubApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "WellhubApiError";
    this.status = status;
    this.body = body;
  }

  get isUnauthorized() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }
  get isUnprocessable() { return this.status === 422; }
  get isClientError() { return this.status >= 400 && this.status < 500; }
  get isServerError() { return this.status >= 500; }
}

export class WellhubConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WellhubConfigError";
  }
}
