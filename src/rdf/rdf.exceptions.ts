import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

export class ParseException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'ParseException';
  }
}

export class DatasetMismatchException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetMismatchException';
  }
}

export class RdfXmlSerializationException extends InternalServerErrorException {
  constructor(message: string) {
    super(message);
    this.name = 'RdfXmlSerializationException';
  }
}
