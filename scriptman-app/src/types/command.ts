export interface CommandError {
  code: string;
  message: string;
  detail?: string;
}

export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: CommandError;
}

export class CommandInvokeError extends Error {
  code: string;
  detail?: string;

  constructor(error: CommandError) {
    super(error.message);
    this.name = "CommandInvokeError";
    this.code = error.code;
    this.detail = error.detail;
  }
}
