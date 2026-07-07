import { Catch, ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { MethodNotAllowedException } from '../../graph-store/exceptions/method-not-allowed.exception';

interface MethodNotAllowedResponse {
  status(code: number): this;
  header(name: string, value: string): this;
  json(body: unknown): void;
}

@Catch(MethodNotAllowedException)
export class MethodNotAllowedFilter implements ExceptionFilter {
  catch(ex: MethodNotAllowedException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<MethodNotAllowedResponse>();
    res
      .status(ex.getStatus())
      .header('Allow', ex.allowedMethods)
      .json(ex.getResponse());
  }
}
