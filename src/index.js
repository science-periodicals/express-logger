import bunyan from 'bunyan';
import onFinished from 'on-finished';
import uuid from 'uuid';

export function createExpressErrorLoggerMiddleware(config = {}) {
  const logger = createExpressLogger(config);

  const { reNoLog } = config;

  return function(err, req, res, next) {
    if (!('id' in req)) {
      req.id = uuid.v4();
    }

    const childLogger = logger.child({ reqId: req.id });
    req.log = childLogger;

    if (reNoLog && reNoLog.test(req.originalUrl)) {
      // Note this must be after we attached the logger
      return next(err, req, res);
    }

    var startTime = process.hrtime();

    onFinished(res, function(errRes, res) {
      var data = {
        req: req,
        res: res
      };

      if (err) {
        data.err = err;
      }

      if (errRes) {
        data.errRes = errRes;
        req.log.error(
          data,
          `${req.method} ${req.baseUrl || ''}${req.path}} (err res)`
        );
        return;
      }

      var level = 'info';
      if (res && res.statusCode) {
        if ((err && err.code !== 404) || res.statusCode >= 500) {
          level = 'error';
          if (req.body) {
            data.body = req.body;
          }
        } else if (res.statusCode === 413) {
          // log 413 as fatal as cloudant won't take the payload
          level = 'fatal';
          if (req.body) {
            data.body = req.body;
          }
        } else if (res.statusCode >= 400) {
          level = res.statusCode === 404 ? 'info' : 'warn';
          if (res.statusCode >= 409) {
            if (req.body) {
              data.body = req.body;
            }
          }
        }
      }

      var hrtime = process.hrtime(startTime);
      var responseTime = hrtime[0] * 1e3 + hrtime[1] / 1e6;

      data.responseTime = responseTime;
      if (req.log === childLogger) {
        req.log[level](
          data,
          `${req.method} ${req.baseUrl || ''}${req.path} (${res.statusCode})`
        );
      }
    });

    next(err, req, res);
  };
}

export function createExpressLoggerMiddleware(config) {
  const eLogger = createExpressErrorLoggerMiddleware(config);
  return function(req, res, next) {
    eLogger(null, req, res, next);
  };
}

export function createExpressLogger(config) {
  config = config || {};

  if (config.logger) {
    return config.logger;
  }

  var bunyanConfig = {
    name: 'bunyan-express-logger',
    serializers: {
      err: bunyan.stdSerializers.err,
      errRes: bunyan.stdSerializers.err,

      req: function(req) {
        if (!req) return req;
        return {
          protocol: req.protocol,
          method: req.method,
          path: req.path,
          query: req.query,
          url: req.originalUrl,
          remoteAddress: req.connection && req.connection.remoteAddress,
          remotePort: req.connection && req.connection.remotePort,
          headers: req.headers,
          session: req.session
        };
      },

      res: function(res) {
        if (!res) return res;
        return {
          statusCode: res.statusCode,
          header: res._header
        };
      },

      ws: function(ws) {
        if (!ws) return ws;
        return {
          wsId: ws.id,
          session: ws.request && ws.request.session
        };
      }
    }
  };

  return bunyan.createLogger(Object.assign(bunyanConfig, config.log));
}
