/*!
 * Dash docset generator
 *
 * Fangdun Cai <cfddream@gmail.com>
 *
 * MIT LICENSE
 *
 * usage:
 *
 *  $ iojs dash.js $(find out/doc/api/*.json)
 *  $ cp -R  io.js/out/doc/api/* iojs.docset/Contents/Resources/Documents/iojs.org/api
 *  $ tar --exclude='.DS_Store' -cvzf iojs.tgz iojs.docset
 */

var Readable = require('stream').Readable;
var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');

// http://kapeli.com/docsets#createsqlite
var docSet = [
  'CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);',
  'CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);'
];
var INSERT_TPL = 'INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ("{name}", "{type}", "{path}");';

var DB_FILE = 'iojs.docset/Contents/Resources/docSet.dsidx';

var blacklist = ['*.json', '_toc.json', 'index.json', 'all.json'];
// node types
var types = 'globals modules classes classMethods methods vars events properties'.split(' '); // 'signatures options params';
var idCounters = {};
var _cache = Object.create(null);

// input paths of files
var args = process.argv.slice(2);
build(args);

// build DB_FILE
function build(args) {
  args = args.filter(function (f) {
    var filename = path.basename(f);
    return !~blacklist.indexOf(filename);
  });

  // test
  //args = ['out/doc/api/all.json'];

  console.log('init', DB_FILE, '...');
  // file
  var f;
  while((f = args.shift())) {
    var s = require(path.resolve(f));
    // filename
    var fn = path.basename(s.source).split('.')[0];
    generate(s, fn, null);
  }

  // test
  //console.dir(docSet);
  output();
}

/**
 * generate
 *
 * @param {object}  o   - object
 * @param {string}  fn  - filename
 * @param {string}  g   - group
 * @param {mix}     pt  - parent type
 * @param {mix}     pn  - parent name
 */
function generate(o, fn, g, pt, pn) {
  var name = o.name;
  var type = o.type;
  var anchor = o.textRaw;
  var _name;
  if (g && name) {
    if (type === 'var') type = 'variable';
    else if (type === 'classMethod') type = 'method';
    else if (g === 'properties' && !pt) type = 'property';

    //console.log(
    insert(
    fn, _name = (
    ~['module', 'global', 'class'].indexOf(type) // ignore
      ? name // noneed add prefix
      : ( pn === fn // top level
         ? [fn, name]
         : (pn
            ? (pn.match(fn) || (pn === 'require' || pn === 'module') // match prefix
               ? [pn, name] // noneed add prefix
               : [fn, pn, name]) // add module prefix
            :  [name] // module, class, global, without prefix
           )
        ).join('.')),
      type,
      (
        fn === 'cluster'
        ? _name
        : (pn === 'require') ? name : anchor)
      );
  }

  var keys = Object.keys(o);
  while ((k = keys.shift())) {
    if (Array.isArray(o[k]) && ~types.indexOf(k)) {
      g = k;
      pt = o.type;
      pn = o.name;
      o[k].forEach(function (v) {
        // missing `property` type.
        if (!v.type && g === 'properties') v.type = 'property';
        generate(v, fn, g, pt, pn);
      });
    }
  }
}

function insert(fn, name, type, anchor) {
  if (!(name && type)) return;
  if (_cache[name + type]) return;
  _cache[name + type] = 1;
  var sql = INSERT_TPL
    .replace('{name}', name)
    .replace('{type}', camelCase(type))
    .replace('{path}', 'iojs.org/api/' + fn + '.html' + (anchor ? '#' + genId([fn, ''+anchor].join(' ')) : ''));

  docSet.push(sql);
}

function output() {
  fs.unlinkSync(DB_FILE);
  var sqlite3  = spawn('sqlite3', [DB_FILE], { stdin: 'pipe' });
  var reader = new Readable;
  docSet.forEach(function (row) {
    reader.push(row + '\n');
  });
  reader.push(null);
  reader.pipe(sqlite3.stdin);
  sqlite3.stdout.on('end', function () {
    console.log('created');
    process.exit(0);
  });
}

// copy from `json.js`
function genId(text) {
  text = text.toLowerCase();
  text = text.replace(/[^a-z0-9]+/g, '_');
  text = text.replace(/^_+|_+$/, '');
  text = text.replace(/^([^a-z])/, '_$1');
  if (idCounters.hasOwnProperty(text)) {
    if (idCounters[text]) {
      text += '_' + idCounters[text];
    }
    idCounters[text]++;
  } else {
    idCounters[text] = 0;
  }
  return text;
}

function camelCase(str) {
  return str[0].toUpperCase() + str.substr(1).toLowerCase();
}