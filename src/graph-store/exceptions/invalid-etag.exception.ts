import { BadRequestException } from '@nestjs/common';

export class InvalidEtagException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEtagException';
  }
}
