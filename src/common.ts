import { GeoJsonObject } from 'geojson';

export class RubbishLocation {
  readonly id?: string
  readonly geojson: GeoJsonObject
  readonly log: Log = []
  constructor(geojson: GeoJsonObject, log: Log, id?: string) {
    this.id = id;
    this.geojson = geojson;
    this.log = log;
  }
}

export class RubbishLocationDbEntry extends RubbishLocation {
  readonly _id: string;
  constructor(_id: string, geojson: GeoJsonObject, log: Log, id?: string) {
    super(geojson, log, id);
    this._id = _id;
  }
}

export type Log = Array<LogEntry>;

export class LogEntry {
  readonly description: string
  constructor(description: string) {
    this.description = description;
  }
}

export namespace ApiOps {
  export class Result {
    readonly data: ResultTypes;
    constructor(data: ResultTypes) {
      this.data = data;
    }
    toString() {
      return JSON.stringify(this);
    }
  }
  type RubbishLocationId = {
    id: string
  }
  type ResultTypes = RubbishLocationId | Array<RubbishLocation> | RubbishLocation;
}
