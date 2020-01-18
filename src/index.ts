import * as config from './config.json';
import express, { Application, Request, Response, NextFunction, Handler } from 'express';
import * as bodyParser from 'body-parser';
import uuid from 'uuid/v4';
import * as url from 'url';
import * as mongodb from 'mongodb';
import session, { SessionOptions } from 'express-session';
import passport from 'passport';
import * as auth0Passport from 'passport-auth0';
import * as querystring from 'querystring';
import { RubbishLocation, ApiOps } from './common';

process.env.AUTH0_CLIENT_ID = config.auth0.clientID;
process.env.AUTH0_DOMAIN = config.auth0.domain;
process.env.AUTH0_CLIENT_SECRET = config.auth0.clientSecret;

const app: Application = express();

const sessionConfig: SessionOptions = {
  secret: 'eedb01b4-e0a1-46c1-b73e-a1454a661116',
  resave: false,
  saveUninitialized: true
}

if (app.get('env') === 'production') {
  sessionConfig.cookie.secure = true;
}

const strategy = new auth0Passport.Strategy({
  ...config.auth0,
  callbackURL: 'http://localhost:3000/successCallback'
}, (_accessToken, _refreshToken, _extraParams, profile, done) => done(null, profile));

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

passport.use(strategy);

const allowCrossDomain: Handler = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', "*");
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
};

app.use(allowCrossDomain);
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('./dist'));

const connectToDb = async (): Promise<mongodb.Db> => {
  const mongoClient: mongodb.MongoClient = new mongodb.MongoClient(config.mongo.connectionUrl, {
    useUnifiedTopology: true
  });
  await mongoClient.connect();
  return mongoClient.db();
}

const addRoutes = async (app: Application, db: Promise<mongodb.Db>): Promise<void> => {

  app.get('/', (req: Request, res: Response) => {
    const { user } = req;
    console.log({user});

    res.render(__dirname + '/resources/index.ejs', {
      ...config.google,
      user
    });
  });

  app.get('/login',
    passport.authenticate('auth0',
      <auth0Passport.AuthenticateOptions>{ scope: 'openid email profile', audience: 'http://localhost:3000/api' })
  );

  app.get('/successCallback',
    (req, res, next) => {
      passport.authenticate('auth0',
        <auth0Passport.AuthenticateOptions>{ audience: 'http://localhost:3000/api' },
        (err, user, _info) => {
          if (err) { return next(err); }
          if (!user) { return res.redirect('/login'); }

          req.login(user, function (err) {
            if (err) { return next(err); }
            const returnTo = req.session.returnTo;
            delete req.session.returnTo;
            res.redirect(returnTo || '/');
          });
        })(req, res, next);
    });

  app.get('/logout',
    (req, res) => {
      req.logout();

      var returnTo = req.protocol + '://' + req.hostname;
      var port = req.connection.localPort;
      if (port !== undefined && port !== 80 && port !== 443) {
        returnTo += ':' + port;
      }
      const logoutURL = new url.URL(`https://${config.auth0.domain}/v2/logout`);
      var searchString = querystring.stringify({
        client_id: config.auth0.clientID,
        returnTo: returnTo
      });
      logoutURL.search = searchString;

      res.redirect(logoutURL.toString());
    });


  app.post('/api/locations',
    async (req: Request, res: Response) => {
      const locationsCollection: mongodb.Collection = (await db).collection('locations');
      console.log(req.body);
      if (!(req.body).log) {
        req.body.log = [];
      }
      const id: string = uuid();
      locationsCollection.save(new RubbishLocation(req.body.geojson, req.body.log, id)).then((result: mongodb.WriteOpResult) => {
        console.log(result.result);
        res.status(200);
        res.send(new ApiOps.Result({ id }).toString());
      }).catch((err: mongodb.MongoError) => {
        res.status(500);
        res.send();
        console.error(err);
      });
    });

  app.get('/api/locations/:id', async (req: Request, res: Response) => {
    const locationsCollection: mongodb.Collection = (await db).collection('locations');
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

  app.post('/api/locations/search', async (req: Request, res: Response) => {
    const locationsCollection: mongodb.Collection = (await db).collection('locations');
    res.status(200);
    res.setHeader('Content-Type', 'application/json');

    let bounds;
    let notIn = [];
    try {
      const query = url.parse(req.url, true).query;
      bounds = JSON.parse(typeof query.bounds === 'string' && query.bounds);
      notIn = JSON.parse(typeof query.notIn === 'string' && query.notIn);
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
  try {
    const db = connectToDb();
    addRoutes(app, db);
  } catch (err) {
    console.error(err);
  }
});