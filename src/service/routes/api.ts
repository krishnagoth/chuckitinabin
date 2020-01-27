import * as jsonConfig from '../../config.json';
import express from 'express';
import { accessMiddleware } from './auth';
import mongodb from 'mongodb';
import * as bodyParser from 'body-parser';
import uuid from 'uuid/v4';
import * as url from 'url';

import { RubbishLocation, ApiOps } from './../../common';

export const apiRouter = (
  db: Promise<mongodb.Db>,
  config: typeof jsonConfig
) => {
  const apiRouter = express.Router();

  apiRouter.use(bodyParser.json());
  apiRouter.use(bodyParser.urlencoded({ extended: true }));

  apiRouter.post(
    '/api/locations',
    accessMiddleware(['add:location']),
    async (req, res) => {
      const locationsCollection: mongodb.Collection = (await db).collection(
        'locations'
      );
      console.log(req.body);
      if (!req.body.log) {
        req.body.log = [];
      }
      const id: string = uuid();
      locationsCollection
        .save(new RubbishLocation(req.body.geojson, req.body.log, id))
        .then((result: mongodb.WriteOpResult) => {
          console.log(result.result);
          res.status(200);
          res.send(new ApiOps.Result({ id }).toString());
        })
        .catch((err: mongodb.MongoError) => {
          res.status(500);
          res.send();
          console.error(err);
        });
    }
  );

  apiRouter.get('/api/locations/:id', async (req, res) => {
    const locationsCollection: mongodb.Collection = (await db).collection(
      'locations'
    );
    locationsCollection
      .findOne<RubbishLocation>({ id: req.params.id })
      .then((document: RubbishLocation) => {
        if (document !== null) {
          res.status(200);
          res.setHeader('Content-Type', 'application/json');
          res.send(new ApiOps.Result(document).toString());
        } else {
          res.send(404);
        }
      })
      .catch(err =>
        console.error(
          `Location not found by id ${req.params.id}: ${err.message}`
        )
      );
  });

  apiRouter.post('/api/locations/search', async (req, res) => {
    const locationsCollection: mongodb.Collection = (await db).collection(
      'locations'
    );
    res.status(200);
    res.setHeader('Content-Type', 'application/json');

    let bounds;
    let notIn = [];
    try {
      const query = url.parse(req.url, true).query;
      bounds = JSON.parse(typeof query.bounds === 'string' && query.bounds);
      notIn = JSON.parse(typeof query.notIn === 'string' && query.notIn);
      console.log(`Bounds ${JSON.stringify(bounds)}\nNot in ${notIn}`);
      locationsCollection
        .find<RubbishLocation>({
          $and: [
            {
              'geojson.geometry': {
                $geoWithin: {
                  $geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [bounds.west, bounds.south],
                        [bounds.west, bounds.north],
                        [bounds.east, bounds.north],
                        [bounds.east, bounds.south],
                        [bounds.west, bounds.south]
                      ]
                    ]
                  }
                }
              }
            },
            {
              id: {
                $nin: notIn
              }
            }
          ]
        })
        .toArray()
        .then((locations: Array<RubbishLocation>) => {
          res.send(new ApiOps.Result(locations).toString());
        });
    } catch (e) {
      console.error('No bounds supplied');
    }
  });

  return apiRouter;
};
