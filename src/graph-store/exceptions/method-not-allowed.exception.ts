import { HttpException, HttpStatus } from '@nestjs/common';

export class MethodNotAllowedException extends HttpException {
  constructor(public readonly allowedMethods: string) {
    super(
      { statusCode: 405, message: 'Method Not Allowed', allow: allowedMethods },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}
