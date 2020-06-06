const process = require('child_process');

const path = GetResourcePath(GetCurrentResourceName());

process.exec(`node ${path}/src/updater.js`, (error, out, err) => {
  if (out === 'UPDATED') {
    console.log('\n\nSeu script da loja foi atualizado\n\n');
  }
  require('./server');
});