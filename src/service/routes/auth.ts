import * as jsonConfig from './../../config.json';
import express, { Handler } from 'express';
import * as url from 'url';
import session, { SessionOptions } from 'express-session';
import passport from 'passport';
import * as auth0Passport from 'passport-auth0';
import * as querystring from 'querystring';
import jwtDecode from 'jwt-decode';
import _ from 'lodash';
import connect from 'connect-mongodb-session';

export const authRouter = (config: typeof jsonConfig): express.Router => {
  const authRouter = express.Router();

  const MongoDBStore = connect(session);

  const store = new MongoDBStore({
    uri: config.mongo.connectionUrl,
    collection: 'authSessions',
    connectionOptions: {
      useUnifiedTopology: true
    }
  });

  const sessionConfig: SessionOptions = {
    secret: 'eedb01b4-e0a1-46c1-b73e-a1454a661116',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 10 // 10 minutes
    },
    store
  };

  if (process.env.ENV === 'production') {
    sessionConfig.cookie.secure = true;
  }

  const strategy = new auth0Passport.Strategy(
    {
      ...config.auth0,
      callbackURL: 'http://localhost:3000/successCallback'
    },
    function(_accessToken, _refreshToken, extraParams, profile, done) {
      done(null, profile, extraParams);
    }
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  passport.use(strategy);

  const allowCrossDomain: Handler = (_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  };

  authRouter.use(allowCrossDomain);
  authRouter.use(session(sessionConfig));
  authRouter.use(passport.initialize());
  authRouter.use(passport.session());

  authRouter.get(
    '/login',
    passport.authenticate('auth0', {
      scope: 'openid email profile',
      audience: 'http://localhost:3000/api'
    } as auth0Passport.AuthenticateOptions)
  );

  authRouter.get('/successCallback', (req, res, next) => {
    passport.authenticate(
      'auth0',
      {
        audience: 'http://localhost:3000/api'
      } as auth0Passport.AuthenticateOptions,
      (err, user, _info) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return res.redirect('/?authViolation=true');
        }

        const decodedToken = jwtDecode<AccessToken>(_info.access_token);
        user.permissions = decodedToken.permissions;

        req.login(user, function(err) {
          if (err) {
            return next(err);
          }
          const returnTo = req.session.returnTo;
          delete req.session.returnTo;
          res.redirect(returnTo || '/');
        });
      }
    )(req, res, next);
  });

  authRouter.get('/logout', (req, res) => {
    req.logout();

    const port = req.connection.localPort;
    const returnTo =
      req.protocol +
      '://' +
      req.hostname +
      (port !== undefined && port !== 80 && port !== 443 ? port : '');

    const logoutURL = new url.URL(`https://${config.auth0.domain}/v2/logout`);
    const searchString = querystring.stringify({
      client_id: config.auth0.clientID,
      returnTo: returnTo
    });
    logoutURL.search = searchString;

    res.redirect(logoutURL.toString());
  });

  return authRouter;
};

type Permission = 'add:location';

interface AccessToken {
  permissions: Permission[];
}

export const accessMiddleware: (
  accessPermissions: Permission[]
) => express.Handler = (accessPermissions: Permission[]) => (
  req,
  res,
  next
): void => {
  if (req.user) {
    const missingPermissions = _.difference(
      accessPermissions,
      (req.user as any).permissions // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    if (missingPermissions.length === 0) {
      next();
    } else {
      res.statusCode = 403;
      res.send(
        `User is missing the following permissions: ${JSON.stringify(
          missingPermissions
        )}`
      );
    }
  } else {
    res.statusCode = 401;
    res.send('User is not authenticated');
  }
};
