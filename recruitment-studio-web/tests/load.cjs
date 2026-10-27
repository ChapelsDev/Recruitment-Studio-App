// Test helper (not shipped): loads the app's classic scripts (js/*.js) into Node,
// sharing one global RS as the browser does. Only scripts that need no DOM at
// load time can be loaded this way.
const path = require('node:path');

module.exports = function load(...files) {
  global.window = global;
  global.RS = global.RS || {};
  for (const f of files) require(path.join(__dirname, '..', 'js', f));
  return global.RS;
};
