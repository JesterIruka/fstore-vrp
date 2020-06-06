const config = require('../config.json');

/**
 * @param {string} plugin
 * @return {boolean}
 */
function hasPlugin(plugin) {
  return config.plugins.findIndex(s=>s.toLowerCase()===plugin.toLowerCase()) !== -1;
}

config.hasPlugin = hasPlugin;

module.exports = config;