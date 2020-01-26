import { GeoJsonObject } from 'geojson';

export class RubbishLocation {
  constructor(
    readonly geojson: GeoJsonObject,
    readonly log: Log = [],
    readonly id?: string
  ) {}
}

export class RubbishLocationDbEntry extends RubbishLocation {
  constructor(
    readonly _id: string,
    geojson: GeoJsonObject,
    log: Log,
    id?: string
  ) {
    super(geojson, log, id);
  }
}

export type Log = Array<LogEntry>;

export class LogEntry {
  constructor(readonly description: string) {}
}

export namespace ApiOps {
  export class Result<T extends ResultTypes> {
    constructor(readonly data: T) {}

    toString(): string {
      return JSON.stringify(this);
    }
  }
  export type RubbishLocationId = {
    id: string;
  };
  export type RubbishLocations = Array<RubbishLocation>;
  type ResultTypes = RubbishLocationId | RubbishLocations | RubbishLocation;
}
