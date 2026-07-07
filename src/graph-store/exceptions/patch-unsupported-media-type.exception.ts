import { HttpException, HttpStatus } from '@nestjs/common';

export class PatchUnsupportedMediaTypeException extends HttpException {
  constructor() {
    super(
      {
        statusCode: 415,
        message: 'Content-Type must be application/sparql-update for PATCH',
      },
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }
}
