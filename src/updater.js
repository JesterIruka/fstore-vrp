const child = require('child_process');
const utils = require('./utils');

const path = GetResourcePath(GetCurrentResourceName())+'/src/real_updater.js';

const update = () => child.exec('node '+path, (error, out, err) => {
  if (error) {
    console.error('Falha ao atualizar...');
    utils.printError(error);
  } else {
    console.log(out);
    console.log(err);
  }
});

update();

module.exports.update = update;