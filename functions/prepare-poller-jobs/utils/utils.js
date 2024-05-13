function loadModule(name) {
    if (libdoc.config.reloadEnabled) {
      const path = require.resolve(name);
      const cached = require.cache[path];
      if (cached) {
        for (const i of cached.children) {
          delete require.cache[i.id];
        }
        delete require.cache[path];
      }
    }
    return require(name); // eslint-disable-line import/no-dynamic-require,global-require
  }

const loadModule = (name) => {

};

module.exports = {
    loadModule
}