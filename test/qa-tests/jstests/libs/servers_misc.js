
/**
 * Run a mongod process.
 *
 * After initializing a MongodRunner, you must call start() on it.
 * @param {int} port port to run db on, use allocatePorts(num) to requisition
 * @param {string} dbpath path to use
 * @param {boolean} peer pass in false (DEPRECATED, was used for replica pair host)
 * @param {boolean} arbiter pass in false (DEPRECATED, was used for replica pair host)
 * @param {array} extraArgs other arguments for the command line
 * @param {object} options other options include no_bind to not bind_ip to 127.0.0.1
 *    (necessary for replica set testing)
 */
MongodRunner = function(port, dbpath, peer, arbiter, extraArgs, options) {
  this.port_ = port;
  this.dbpath_ = dbpath;
  this.peer_ = peer;
  this.arbiter_ = arbiter;
  this.extraArgs_ = extraArgs;
  this.options_ = options ? options : {};
};

/**
 * Start this mongod process.
 *
 * @param {boolean} reuseData If the data directory should be left intact (default is to wipe it)
 */
MongodRunner.prototype.start = function(reuseData) {
  var args = [];
  if (reuseData) {
    args.push("mongod");
  }
  args.push(
    "--port", this.port_,
    "--dbpath", this.dbpath_
  );
  if (!this.options_.no_bind) {
    args.push("--bind_ip", "127.0.0.1");
  }
  if (this.extraArgs_) {
    args = args.concat(this.extraArgs_);
  }
  removeFile(this.dbpath_ + "/mongod.lock");
  if (reuseData) {
    return startMongoProgram.apply(null, args);
  }
  return startMongod.apply(null, args);
};

MongodRunner.prototype.port = function() {
  return this.port_;
};

MongodRunner.prototype.toString = function() {
  return [this.port_, this.dbpath_, this.peer_, this.arbiter_].toString();
};

ToolTest = function(name, extraOptions) {
  this.useSSL = jsTestOptions().useSSL;
  this.name = name;
  this.options = extraOptions;
  this.port = allocatePorts(1)[0];
  this.baseName = "jstests_tool_" + name;
  this.root = MongoRunner.dataPath + this.baseName;
  this.dbpath = this.root + "/";
  this.ext = this.root + "_external/";
  this.extFile = this.root + "_external/a";
  mkdir(this.dbpath);
  resetDbpath(this.dbpath);
  resetDbpath(this.ext);
};

ToolTest.prototype.startDB = function(coll) {
  assert(!this.m, "db already running");

  var options = {
    port: this.port,
    dbpath: this.dbpath,
    bind_ip: "127.0.0.1",
  };

  Object.extend(options, this.options);

  if (this.useSSL) {
    Object.extend(options, {
      sslMode: "requireSSL",
      sslPEMKeyFile: "jstests/libs/server.pem",
      sslCAFile: "jstests/libs/ca.pem",
      sslWeakCertificateValidation: "",
    });
  }

  this.m = startMongoProgram.apply(null, MongoRunner.arrOptions("mongod", options));
  this.db = this.m.getDB(this.baseName);
  if (coll) {
    return this.db.getCollection(coll);
  }
  return this.db;
};

ToolTest.prototype.stop = function() {
  if (!this.m) {
    return;
  }
  MongoRunner.stopMongod(this.port);
  this.m = null;
  this.db = null;

  print('*** ' + this.name + " completed successfully ***");
};

ToolTest.prototype.runTool = function() {
  var a = ["mongo" + arguments[0]];

  var hasdbpath = false;

  for (var i=1; i<arguments.length; i++) {
    a.push(arguments[i]);
    if (arguments[i] === "--dbpath") {
      hasdbpath = true;
    }
  }

  if (this.useSSL) {
    a = a.concat(["--ssl",
      "--sslPEMKeyFile", "jstests/libs/server.pem",
      "--sslCAFile", "jstests/libs/ca.pem",
      "--sslAllowInvalidHostnames"]);
  }

  if (!hasdbpath) {
    a.push("--host");
    a.push("127.0.0.1:" + this.port);
  }

  return runMongoProgram.apply(null, a);
};


ReplTest = function(name, ports) {
  this.name = name;
  this.ports = ports || allocatePorts(2);
};

ReplTest.prototype.getPort = function(master) {
  if (master) {
    return this.ports[0];
  }
  return this.ports[1];
};

ReplTest.prototype.getPath = function(master) {
  var p = MongoRunner.dataPath + this.name + "-";
  if (master) {
    p += "master";
  } else {
    p += "slave";
  }
  return p;
};

ReplTest.prototype.getOptions = function(master, extra, putBinaryFirst, norepl) {
  if (!extra) {
    extra = {};
  }

  if (!extra.oplogSize) {
    extra.oplogSize = "40";
  }

  var a = [];
  if (putBinaryFirst) {
    a.push("mongod");
  }
  a.push(
    "--bind_ip", "127.0.0.1",
    "--port", this.getPort(master),
    "--dbpath", this.getPath(master));
  if (jsTestOptions().noJournal) {
    a.push("--nojournal");
  }
  if (jsTestOptions().keyFile) {
    a.push("--keyFile", jsTestOptions().keyFile);
  }

  if (jsTestOptions().useSSL) {
    if (!Array.contains(a, "--sslMode")) {
      a.push("--sslMode", "requireSSL");
    }
    if (!Array.contains(a, "--sslPEMKeyFile")) {
      a.push("--sslPEMKeyFile", "jstests/libs/server.pem");
    }
    if (!Array.contains(a, "--sslCAFile")) {
      a.push("--sslCAFile", "jstests/libs/ca.pem");
    }
    a.push("--sslWeakCertificateValidation");
  }
  if (jsTestOptions().useX509 && !Array.contains(a, "--clusterAuthMode")) {
    a.push("--clusterAuthMode", "x509");
  }

  if (!norepl) {
    if (master) {
      a.push("--master");
    } else {
      a.push("--slave", "--source", "127.0.0.1:" + this.ports[0]);
    }
  }

  for (var k in extra) {
    if (!extra.hasOwnProperty(k)) {
      continue;
    }
    var v = extra[k];
    if (k in MongoRunner.logicalOptions) {
      continue;
    }
    a.push("--" + k);
    if (v !== undefined && v !== null && v !== "") {
      a.push(v);
    }
  }

  return a;
};

ReplTest.prototype.start = function(master, options, restart, norepl) {
  var lockFile = this.getPath(master) + "/mongod.lock";
  removeFile(lockFile);
  var o = this.getOptions(master, options, restart, norepl);

  if (restart) {
    var conn = startMongoProgram.apply(null, o);
    if (!master) {
      conn.setSlaveOk();
    }
    return conn;
  }
  conn = startMongod.apply(null, o);
  if (jsTestOptions().keyFile || jsTestOptions().auth || jsTestOptions().useX509) {
    jsTest.authenticate(conn);
  }
  if (!master) {
    conn.setSlaveOk();
  }
  return conn;
};

ReplTest.prototype.stop = function(master, signal) {
  if (arguments.length === 0) {
    this.stop(true);
    this.stop(false);
    return;
  }

  print('*** ' + this.name + " completed successfully ***");
  return MongoRunner.stopMongod(this.getPort(master), signal || 15);
};

if (typeof allocatePort === 'function') {
  allocatePorts = function (numPorts) {
    var ports = [];
    for (var i = 0; i < numPorts; i++) {
      ports.push(allocatePort());
    }
    return ports;
  };
} else {
  allocatePorts = function(n, startPort) {
    var ret = [];
    var start = startPort || 31000;
    for (var i = start; i < start + n; ++i) {
      ret.push(i);
    }
    return ret;
  };
}


SyncCCTest = function(testName, extraMongodOptions) {
  this._testName = testName;
  this._connections = [];

  for (var i=0; i<3; i++) {
    this._connections.push(startMongodTest(30000 + i, testName + i, false, extraMongodOptions));
  }

  this.url = this._connections.map(function(z) {
    return z.name;
  }).join(",");
  this.conn = new Mongo(this.url);
};

SyncCCTest.prototype.stop = function() {
  for (var i=0; i<this._connections.length; i++) {
    MongoRunner.stopMongod(30000 + i);
  }

  print('*** ' + this._testName + " completed successfully ***");
};

SyncCCTest.prototype.checkHashes = function(dbname, msg) {
  var hashes = this._connections.map(function(z) {
    return z.getDB(dbname).runCommand("dbhash");
  });

  for (var i=1; i<hashes.length; i++) {
    assert.eq(hashes[0].md5, hashes[i].md5, "checkHash on " + dbname + " " + msg + "\n" + tojson(hashes));
  }
};

SyncCCTest.prototype.tempKill = function(num) {
  num = num || 0;
  MongoRunner.stopMongod(30000 + num);
};

SyncCCTest.prototype.tempStart = function(num) {
  num = num || 0;
  this._connections[num] = startMongodTest(30000 + num, this._testName + num, true);
};


function startParallelShell(jsCode, port, noConnect) {
  var x;

  var args = ["mongo"];

  // Convert function into call-string
  if (typeof (jsCode) === "function") {
    var id = Math.floor(Math.random() * 100000);
    jsCode = "var f" + id + " = " + jsCode.toString() + ";f" + id + "();";
  } else if (typeof (jsCode) === "string") {
    // do nothing
  } else {
    throw Error("bad first argument to startParallelShell");
  }

  if (noConnect) {
    args.push("--nodb");
  } else if (typeof (db) === "object") {
    jsCode = "db = db.getSiblingDB('" + db.getName() + "');" + jsCode;
  }

  if (TestData) {
    jsCode = "TestData = " + tojson(TestData) + ";" + jsCode;
  }

  args.push("--eval", jsCode);

  if (typeof db === "object") {
    var hostAndPort = db.getMongo().host.split(':');
    var host = hostAndPort[0];
    args.push("--host", host);
    if (!port && hostAndPort.length >= 2) {
      port = hostAndPort[1];
    }
  }
  if (port) {
    args.push("--port", port);
  }


  x = startMongoProgramNoConnect.apply(null, args);
  return function() {
    return waitProgram(x);
  };
}

var testingReplication = false;
