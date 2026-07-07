import { ArgumentsHost } from '@nestjs/common';
import { MethodNotAllowedFilter } from '../../../src/common/filters/method-not-allowed.filter';
import { MethodNotAllowedException } from '../../../src/graph-store/exceptions/method-not-allowed.exception';

describe('MethodNotAllowedFilter', () => {
  it('reuses the exception status and JSON body while setting the Allow header', () => {
    const filter = new MethodNotAllowedFilter();
    const status = jest.fn().mockReturnThis();
    const header = jest.fn().mockReturnThis();
    const json = jest.fn();
    const response = { status, header, json };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const exception = new MethodNotAllowedException('GET, POST');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(405);
    expect(header).toHaveBeenCalledWith('Allow', 'GET, POST');
    expect(json).toHaveBeenCalledWith({
      statusCode: 405,
      message: 'Method Not Allowed',
      allow: 'GET, POST',
    });
  });
});
