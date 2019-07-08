import assert from 'assert';
import http from 'http';
import { Writable } from 'stream';
import express from 'express';
import request from 'request';
import enableDestroy from 'server-destroy';
import bodyParser from 'body-parser';

import {
  createExpressErrorLoggerMiddleware,
  createExpressLoggerMiddleware
} from '../src';

describe('express-loggoer', function() {
  let server;
  const ws = new Writable({ objectMode: true });
  let logs = [];
  ws._write = function(chunk, enc, next) {
    logs.push(chunk);
    next();
  };

  before(done => {
    const app = express();
    app.use(
      createExpressLoggerMiddleware({
        log: {
          name: 'logger',
          streams: [
            {
              level: 'trace',
              type: 'raw',
              stream: ws
            }
          ]
        }
      })
    );
    app.get('/200', (req, res, next) => {
      res.status(200).json({ ok: true });
    });
    app.get('/404', (req, res, next) => {
      const err = new Error('custom error!');
      err.code = 404;
      return next(err);
    });
    app.get('/413', bodyParser.json(), (req, res, next) => {
      const err = new Error('custom error!');
      err.code = 413;
      return next(err);
    });
    app.use(
      createExpressErrorLoggerMiddleware({
        log: {
          name: 'errorr logger',
          streams: [
            {
              level: 'trace',
              type: 'raw',
              stream: ws
            }
          ]
        }
      })
    );
    app.use((err, req, res, next) => {
      res.status(err.code).json({ err: err.message });
    });
    server = http.createServer(app);
    enableDestroy(server);
    server.listen(4000, done);
  });

  it('should log success', done => {
    request.get(
      {
        url: 'http://127.0.0.1:4000/200'
      },
      (err, resp, body) => {
        assert.equal(logs.length, 1);
        assert.equal(logs[0].res.statusCode, 200);
        // console.log(require('util').inspect(logs[0], { depth: null }));
        logs = [];
        done();
      }
    );
  });

  it('should log errors', done => {
    request.get(
      {
        url: 'http://127.0.0.1:4000/413',
        json: {
          payload: true
        }
      },
      (err, resp, body) => {
        assert.equal(logs.length, 1);
        // console.log(require('util').inspect(logs[0], { depth: null }));
        assert(logs[0].err);
        assert(logs[0].body);
        assert.equal(logs[0].res.statusCode, 413);
        assert.equal(logs[0].level, 50, 'fatal level (exception for 413)');
        logs = [];
        done();
      }
    );
  });

  it('should log 404 error with info level', done => {
    request.get(
      {
        url: 'http://127.0.0.1:4000/404',
        json: true
      },
      (err, resp, body) => {
        assert.equal(logs.length, 1);
        // console.log(require('util').inspect(logs[0], { depth: null }));
        assert(logs[0].err);
        assert.equal(logs[0].level, 30, 'info level');
        logs = [];
        done();
      }
    );
  });

  after(() => {
    server.destroy();
    try {
      ws.destroy();
    } catch (err) {}
  });
});
