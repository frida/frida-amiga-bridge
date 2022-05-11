// Author: hot3eed <hot3eed@gmail.com>
// License: Apache-2.0

const Amiga = require('../dist');

Object.defineProperty(global, 'Amiga', {
  value: Amiga,
  configurable: true,
  enumerable: true,
});
