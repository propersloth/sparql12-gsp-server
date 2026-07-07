import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { PatchUnsupportedMediaTypeException } from '../exceptions/patch-unsupported-media-type.exception';

interface ResponseLike {
  status(code: number): this;
  header(name: string, value: string): this;
  json(body: unknown): void;
}

@Catch(PatchUnsupportedMediaTypeException)
export class PatchMediaTypeFilter implements ExceptionFilter {
  catch(ex: PatchUnsupportedMediaTypeException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<ResponseLike>();
    const body = ex.getResponse() as { statusCode: number; message: string };
    res
      .status(415)
      .header('Accept-Patch', 'application/sparql-update')
      .json({ statusCode: 415, message: body.message });
  }
}
