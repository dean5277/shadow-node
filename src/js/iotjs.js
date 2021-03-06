/* Copyright 2015-present Samsung Electronics Co., Ltd. and other contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function() {
  this.global = this;

  function Module(id) {
    this.id = id;
    this.exports = {};
  }


  Module.cache = {};

  Module.require = function(id) {
    if (id == 'native') {
      return Module;
    }

    if (Module.cache[id]) {
      return Module.cache[id].exports;
    }

    var module = new Module(id);

    Module.cache[id] = module;
    module.compile();

    return module.exports;
  };


  Module.prototype.compile = function() {
    process.compileModule(this, Module.require);
  };

  global.console = Module.require('console');
  global.Buffer = Module.require('buffer');

  var timers = undefined;

  var _timeoutHandler = function(mode) {
    if (timers == undefined) {
      timers = Module.require('timers');
    }
    return timers[mode].apply(this, Array.prototype.slice.call(arguments, 1));
  };

  global.setTimeout = _timeoutHandler.bind(this, 'setTimeout');
  global.setInterval = _timeoutHandler.bind(this, 'setInterval');
  global.clearTimeout = _timeoutHandler.bind(this, 'clearTimeout');
  global.clearInterval = _timeoutHandler.bind(this, 'clearInterval');

  var EventEmitter = Module.require('events').EventEmitter;

  EventEmitter.call(process);

  var keys = Object.keys(EventEmitter.prototype);
  var keysLength = keys.length;
  for (var i = 0; i < keysLength; ++i) {
    var key = keys[i];
    if (!process[key]) {
      process[key] = EventEmitter.prototype[key];
    }
  }

  var nextTickQueue = [];

  process.nextTick = nextTick;
  process._onNextTick = _onNextTick;

  function _onNextTick() {
    // clone nextTickQueue to new array object, and calls function
    // iterating the cloned array. This is because,
    // during processing nextTick
    // a callback could add another next tick callback using
    // `process.nextTick()`, if we calls back iterating original
    // `nextTickQueue` that could turn into infinite loop.

    var callbacks = nextTickQueue.slice(0);
    nextTickQueue = [];

    var len = callbacks.length;
    for (var i = 0; i < len; ++i) {
      try {
        callbacks[i]();
      } catch (e) {
        process._onUncaughtException(e);
      }
    }

    return nextTickQueue.length > 0;
  }


  function nextTick(callback) {
    var args = Array.prototype.slice.call(arguments);
    args[0] = null;
    nextTickQueue.push(Function.prototype.bind.apply(callback, args));
  }


  process._onUncaughtException = _onUncaughtException;
  function _onUncaughtException(error) {
    var event = 'uncaughtException';
    if (process._events[event] && process._events[event].length > 0) {
      try {
        // Emit uncaughtException event.
        process.emit('uncaughtException', error);
      } catch (e) {
        // Even uncaughtException handler thrown, that could not be handled.
        console.error('uncaughtException handler throws: ' + e);
        process.exit(1);
      }
    } else {
      // Exit if there are no handler for uncaught exception.
      console.error('uncaughtException: ' + error);
      process.exit(1);
    }
  }

  var os = Module.require('os');

  process.uptime = function() {
    return os.uptime();
  };

  process.exitCode = 0;
  process._exiting = false;
  process.emitExit = function(code) {
    if (!process._exiting) {
      process._exiting = true;
      if (code || code == 0) {
        process.exitCode = code;
      }
      process.emit('exit', process.exitCode || 0);
    }
  };

  function updateEnviron() {
    var envs = process._getEnvironArray();
    envs.forEach(function(env, idx) {
      var item = env.split('=');
      var key = item[0];
      var val = item[1];
      process.env[key] = val;
    });
  }
  updateEnviron();

  // compatible with stdout
  process.stdout = {
    isTTY: false,
    write: console._stdout,
  };

  // compatible with stdout
  process.stderr = {
    isTTY: false,
    write: console._stderr,
  };

  // FIXME(Yorkie): the NamedPropertyHandlerConfiguration is not implemented at IoT.js
  process.set = function(key, val) {
    if (key === 'env' || key === 'environ') {
      for (var key in val) {
        process._setEnviron(key, val[key]);
      }
      updateEnviron();
    } else {
      throw new Error('Not supported property');
    }
  };

  process.exit = function(code) {
    try {
      process.emitExit(code);
    } catch (e) {
      process.exitCode = 1;
      process._onUncaughtException(e);
    } finally {
      process.doExit(process.exitCode || 0);
    }
  };

  function setupChannel() {
    // If we were spawned with env NODE_CHANNEL_FD then load that up and
    // start parsing data from that stream.
    if (process.env.NODE_CHANNEL_FD) {
      var fd = parseInt(process.env.NODE_CHANNEL_FD, 10);

      // Make sure it's not accidentally inherited by child processes.
      delete process.env.NODE_CHANNEL_FD;
      var cp = Module.require('child_process');
      cp._forkChild(fd);
    }
  }
  setupChannel();

  /**
   * Polyfills Start
   */

  if (typeof Object.assign != 'function') {
    // Must be writable: true, enumerable: false, configurable: true
    Object.defineProperty(Object, "assign", {
      value: function assign(target, varArgs) { // .length of function is 2
        'use strict';
        if (target == null) { // TypeError if undefined or null
          throw new TypeError('Cannot convert undefined or null to object');
        }

        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
          var nextSource = arguments[index];
          if (nextSource != null) { // Skip over if undefined or null
            for (var nextKey in nextSource) {
              // Avoid bugs when hasOwnProperty is shadowed
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey];
              }
            }
          }
        }
        return to;
      },
      writable: true,
      configurable: true
    });
  }

  function CallSite(name, opts) {
    this._name = name;
    this._filename = opts[0];
    this._line = opts[1];
    this._column = opts[2];
    this._origin = false;
  }

  CallSite.create = function(name, opts) {
    return new CallSite(name, opts);
  };

  CallSite.prototype.getFileName = function() {
    return this._filename || '<anonymous>';
  };

  CallSite.prototype.getLineNumber = function() {
    return this._line || 1;
  };

  CallSite.prototype.getColumnNumber = function() {
    return this._column || 7;
  };

  CallSite.prototype.getFunctionName = function() {
    return this._name || 'undefined';
  };

  CallSite.prototype.isEval = function() {
    if (this._origin) {
      return true;
    } else {
      this._origin = 
        this.getFunctionName() + ' ' +
        '(' + 
          this.getFileName() + ':' + 
          this.getLineNumber() + ':' + 
          this.getColumnNumber() + 
        ')';
      return true;
    }
  };

  CallSite.prototype.getEvalOrigin = function() {
    return this._origin;
  };

  function prepareStackTrace(throwable) {
    return [
      CallSite.create('main', ['<anonymous>', 1, 7]),
      CallSite.create('main', ['<anonymous>', 2, 7]),
      CallSite.create('main', ['<anonymous>', 3, 7]),
      CallSite.create('main', ['<anonymous>', 4, 7]),
    ];
  }

  Error.stackTraceLimit = 1;
  Error.prepareStackTrace = prepareStackTrace;
  Error.captureStackTrace = function(throwable, terminator) {
    Object.defineProperties(throwable, {
      stack: {
        configurable: true,
        get: function () {
          return prepareStackTrace(throwable);
        }
      },
      cachedStack: {
        configurable: true,
        writable: true,
        enumerable: false,
        value: true
      }
    });
  };

  Error.getStackTrace = function(throwable) {
    if (throwable.cachedStack)
      return throwable.stack;
    var stack = prepareStackTrace(throwable);
    try {
      Object.defineProperties(throwable, {
        stack: {
          configurable: true,
          writable: true,
          enumerable: false,
          value: stack
        },
        cachedStack: {
          configurable: true,
          writable: true,
          enumerable: false,
          value: true
        }
      });
    } catch (nonConfigurableError) {
      // SKIP
    }
    return stack;
  };

  /**
   * Polyfills End
   */

  var module = Module.require('module');
  module.runMain();
})();
