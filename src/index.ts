import config from './config';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as uuid from 'uuid/v4';
import * as url from 'url';
import * as mongodb from 'mongodb';
import * as http from 'http';
import { RubbishLocation, ApiOps } from './common';

const app: express.Application = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('src/resources'));

async function connectToDb(): Promise<mongodb.Db> {
  const mongoClient: mongodb.MongoClient = mongodb.MongoClient;
  return mongoClient.connect(config.mongo.connectionUrl);
}

function addRoutes(db: mongodb.Db): void {

  const locationsCollection: mongodb.Collection = db.collection('locations');

  app.get('/', (req: express.Request, res: express.Response) => {
    res.render(__dirname + '/resources/index.ejs', config.google);
  });

  app.post('/api/locations', (req: express.Request, res: express.Response) => {
    console.log(req.body);
    if (!(req.body).log) {
      req.body.log = [];
    }
    const id: string = uuid();
    locationsCollection.save(Object.assign({ id: id }, req.body) as RubbishLocation).then((result: mongodb.WriteOpResult) => {
      console.log(result.result);
      res.status(200);
      res.send(new ApiOps.Result({ id: id }).toString());
    }).catch((err: mongodb.MongoError) => {
      res.status(500);
      res.send();
      console.error(err);
    });
  });

  app.get('/api/locations/:id', (req: express.Request, res: express.Response) => {
    locationsCollection.findOne<RubbishLocation>({ id: req.params.id })
      .then((document: RubbishLocation) => {
        if (document !== null) {
          res.status(200);
          res.setHeader('Content-Type', 'application/json');
          res.send(new ApiOps.Result(document).toString());
        } else {
          res.send(404);
        }
      })
      .catch((err) => console.error(`Location not found by id ${req.params.id}: ${err.message}`));
  });

  app.post('/api/locations/search', (req: express.Request, res: express.Response) => {
    res.status(200);
    res.setHeader('Content-Type', 'application/json');

    let bounds;
    let notIn = [];
    try {
      bounds = JSON.parse(url.parse(req.url, true).query.bounds);
      notIn = JSON.parse(url.parse(req.url, true).query.notIn);
      console.log(`Bounds ${JSON.stringify(bounds)}\nNot in ${notIn}`);
      locationsCollection.find<RubbishLocation>({
        $and: [{
          'geojson.geometry': {
            $geoWithin: {
              $geometry: {
                type: "Polygon",
                coordinates: [[
                  [bounds.west, bounds.south],
                  [bounds.west, bounds.north],
                  [bounds.east, bounds.north],
                  [bounds.east, bounds.south],
                  [bounds.west, bounds.south]
                ]]
              }
            }
          }
        },
        {
          id: {
            $nin: notIn
          }
        }]
      }).toArray().then((locations: Array<RubbishLocation>) => {
        res.send(new ApiOps.Result(locations).toString());
      });
    } catch (e) {
      console.error('No bounds supplied');
    }
  });
}

app.listen(3000, async function () {
  const db = await connectToDb();
  addRoutes(db);
});