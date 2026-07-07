export class ParseException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseException';
  }
}

export class DatasetMismatchException extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'DatasetMismatchException';
  }
}

export class RdfXmlSerializationException extends Error {
  readonly statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = 'RdfXmlSerializationException';
  }
}
