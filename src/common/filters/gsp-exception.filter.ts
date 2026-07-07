import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

interface GspError {
  name: string;
  message: string;
}

interface HttpResponse {
  status(code: number): this;
  json(body: unknown): void;
}

@Catch()
export class GspExceptionFilter implements ExceptionFilter {
  catch(exception: GspError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<HttpResponse>();
    const request = ctx.getRequest<{ url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'InternalServerError';

    if (exception.name === 'ParseException') {
      status = HttpStatus.BAD_REQUEST;
      error = 'ParseException';
    } else if (exception.name === 'InvalidIriException') {
      status = HttpStatus.BAD_REQUEST;
      error = 'InvalidIriException';
    } else if (exception.name === 'DatasetMismatchException') {
      status = HttpStatus.BAD_REQUEST;
      error = 'DatasetMismatchException';
    } else if (exception.name === 'InvalidEtagException') {
      status = HttpStatus.BAD_REQUEST;
      error = 'InvalidEtagException';
    } else if (exception.name === 'GraphNotFoundException') {
      status = HttpStatus.NOT_FOUND;
      error = 'GraphNotFoundException';
    } else if (exception.name === 'UnauthorizedException') {
      status = HttpStatus.UNAUTHORIZED;
      error = 'UnauthorizedException';
    } else if (exception.name === 'ForbiddenException') {
      status = HttpStatus.FORBIDDEN;
      error = 'ForbiddenException';
    } else if (exception.name === 'PreconditionFailedException') {
      status = HttpStatus.PRECONDITION_FAILED;
      error = 'PreconditionFailedException';
    } else if (exception.name === 'PreconditionRequiredException') {
      status = 428;
      error = 'PreconditionRequiredException';
    } else if (exception.name === 'UnsupportedMediaTypeException') {
      status = HttpStatus.UNSUPPORTED_MEDIA_TYPE;
      error = 'UnsupportedMediaTypeException';
    } else if (exception.name === 'UnprocessableEntityException') {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      error = 'UnprocessableEntityException';
    } else if (exception.name === 'NotAcceptableException') {
      status = HttpStatus.NOT_ACCEPTABLE;
      error = 'NotAcceptableException';
    } else if (exception.name === 'RdfXmlSerializationException') {
      // GSP-004: RDF/XML cannot express every graph (unsplittable predicate
      // IRIs, XML-1.0-illegal literal characters). This is a property of the
      // format, not a bug — named explicitly so it's distinguishable from an
      // unexpected server fault in logs and API responses, per the policy
      // recorded in application-design.md §7.1. Still 500: the media type
      // *is* supported, this specific graph is unserializable in it, and
      // silently dropping the statement would violate the round-trip MUSTs.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'RdfXmlSerializationException';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = exception.name;
    }

    response.status(status).json({
      statusCode: status,
      error,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
