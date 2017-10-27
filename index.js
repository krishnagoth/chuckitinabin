const config = require('./config');
const express = require('express');
const bodyParser = require('body-parser')
const uuid = require('uuid/v4');
const url = require('url');
const MongoClient = require('mongodb').MongoClient;

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('src/resources'));

new Promise((resolve, reject) => {
  MongoClient.connect(config.mongo.connectionUrl,
    (err, database) => {
      if (err) reject(err);
      resolve(database);
    });
}).then((db) => {

  const locationsCollection = db.collection('locations');

  app.listen(3000, function () { });

  app.get('/', (req, res) => {
    res.render(__dirname + '/src/resources/index.ejs', config.google);
  })

  app.post('/api/locations', (req, res) => {
    console.log(req.body);
    const id = uuid();
    locationsCollection.save(
      Object.assign({ id: id }, req.body),
      (err, result) => {
        if (err) {
          res.status(500);
          res.send();
          return console.error(err);
        }
        console.log(result);
        res.status(200);
        res.send({ data: { id: id } });
      });
  });

  app.get('/api/locations/:id', (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
      data: locationsCollection.findOne({ id: req.params.id }, (err, document) => {
        if (err) throw err;
        return document;
      })
    }));
  });

  app.post('/api/locations/search', (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'application/json');

    let bounds;
    let notIn = [];
    try {
      bounds = JSON.parse(url.parse(req.url, true).query.bounds);
      notIn = JSON.parse(url.parse(req.url, true).query.notIn);
      console.log(`Bounds ${JSON.stringify(bounds)}\nNot in ${notIn}`);
      locationsCollection.find({
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
      }).toArray().then((locations) => {
        res.send(JSON.stringify({
          data: locations
        }));
      });
    } catch (e) {
      console.error('No bounds supplied');
    }
  });
});


