/**
 * Start and stop geth from Node.js.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var fs = require("fs");
var join = require("path").join;
var cp = require("child_process");

var noop = function () {};

module.exports = {
  version: "0.4.0",

  debug: false,
  proc: null,
  flags: [],
  bin: null,
  configured: false,
  persist: false,

  configure: function (options) {
    this.bin = options.geth_bin || "geth";
    this.persist = options.persist || false;
    this.debug = options.debug || false;
    this.configured = true;

    return;
  },

  listen: function (stream, label, listener) {
    if (label && label.constructor === Function && !listener) {
      listener = label;
      label = null;
    }
    label = label || "data";
    listener = listener || noop;
    if (this.proc !== null) {
      this.proc[stream]._events[label] = listener;
    }
  },

  stdout: function (label, listener) {
    this.listen("stdout", label, listener);
  },

  stderr: function (label, listener) {
    this.listen("stderr", label, listener);
  },

  trigger: noop,

  start: function (flags, listeners, trigger) {
    var self = this;

    if (this.configured) {
      flags.datadir =
        flags.datadir || join(process.env.HOME, ".ethereum-" + flags.networkid);
      if (flags.symlink) {
        if (fs.existsSync(flags.symlink)) fs.unlinkSync(flags.symlink);
        fs.symlinkSync(flags.datadir, flags.symlink);
        flags.datadir = flags.symlink;
      }

      var unlock = false;
      var password = false;

      if (flags.account) {
        this.flags = this.flags.concat([
          "--etherbase",
          flags.account,
          "--unlock",
          flags.account,
          "--password",
          join(flags.datadir, ".password"),
        ]);

        unlock = true;
        password = true;
      }

      var rpc = false;
      var rpcport = false;
      var rpcapi = false;
      var ws = false;
      var wsport = false;
      var wsapi = false;

      if (flags.constructor === Object) {
        for (var flag in flags) {
          if (!flags.hasOwnProperty(flag)) continue;

          this.flags.push("--" + flag);

          if (flags[flag]) {
            if (flags[flag].constructor === Array) {
              this.flags.push(flags[flag].join(" "));
            } else {
              this.flags.push(flags[flag]);
            }
          }

          if (flag === "rpc") rpc = true;
          if (flag === "rpcport") rpcport = true;
          if (flag === "rpcapi") rpcapi = true;
          if (flag === "ws") ws = true;
          if (flag === "wsport") wsport = true;
          if (flag === "wsapi") wsapi = true;
          if (flag === "unlock") unlock = true;
          if (flag === "password") password = true;
        }
      }
      if ((rpcport || rpcapi) && !rpc) this.flags.push("--rpc");
      if ((wsport || wsapi) && !ws) this.flags.push("--ws");
      if (unlock && !password) {
        this.flags = this.flags.concat([
          "--password",
          join(flags.datadir, ".password"),
        ]);
      }

      listeners = listeners || {};
      this.trigger = trigger || noop;

      if (!this.persist && !process._events.exit) {
        process.on("exit", function () {
          if (self.proc !== null) self.stop();
        });
      }

      if (!listeners.stdout) {
        listeners.stdout = function (data) {
          if (self.debug) process.stdout.write(data);
        };
      }

      if (!listeners.stderr) {
        listeners.stderr = function (data) {
          if (self.debug) process.stdout.write(data);
          if (data.toString().indexOf("IPC endpoint opened") > -1) {
            self.trigger(null, self.proc);
          }
        };
      }

      if (!listeners.close) {
        listeners.close = function (code) {
          if (code !== 2 && code !== 0) {
            self.trigger(new Error("geth closed with code " + code));
          }
        };
      }

      this.proc = cp.spawn(this.bin, this.flags);
      this.proc.stdout.on("data", listeners.stdout);
      this.proc.stderr.on("data", listeners.stderr);
      this.proc._events.close = listeners.close;

      return this.proc;
    } else {
      throw new Error("Geth not configured");
    }
  },

  stop: function (callback) {
    var self = this;

    callback = callback || noop;

    if (this.proc !== null) {
      var closed = function (code) {
        self.configured = false;
        if (self.proc !== null) {
          self.proc._events.close = null;
        }
        self.proc = null;
        callback(null, code);
      };
      this.proc.on("close", closed);
      this.proc.kill("SIGINT");
    } else {
      callback();
    }
  },
};
