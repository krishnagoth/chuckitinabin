import * as config from './config.json';
import express, { Application, Request, Response } from 'express';

import * as mongodb from 'mongodb';
import { authRouter } from './service/routes/auth';
import { apiRouter } from './service/routes/api';

const app: Application = express();

app.set('view engine', 'ejs');
app.use(express.static('./dist'));

const connectToDb = async (): Promise<mongodb.Db> => {
  const mongoClient: mongodb.MongoClient = new mongodb.MongoClient(
    config.mongo.connectionUrl,
    {
      useUnifiedTopology: true
    }
  );
  await mongoClient.connect();
  return mongoClient.db();
};

const addRoutes = async (
  app: Application,
  db: Promise<mongodb.Db>
): Promise<void> => {
  app.use(authRouter(config));

  app.use(apiRouter(db, config));

  app.get('/', (req: Request, res: Response) => {
    const { user } = req;

    res.render(__dirname + '/resources/index.ejs', {
      ...config.google,
      user,
      authViolation: req.query.authViolation
    });
  });
};

app.listen(3000, async function() {
  try {
    const db = connectToDb();
    addRoutes(app, db);
  } catch (err) {
    console.error(err);
  }
});
