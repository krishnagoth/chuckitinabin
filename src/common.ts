import { GeoJsonObject } from 'geojson';

export interface RubbishLocation {
  _id?: string
  id: string
  geojson: GeoJson
  log?: Log
}

export type GeoJson = GeoJsonObject;
export type Log = Array<LogEntry>;

export interface LogEntry {
  description: string
}

export namespace ApiOps {
  export class Result {
    protected data: ResultTypes;
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
