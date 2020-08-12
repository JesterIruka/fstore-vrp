const db = require('./mysql');
const api = require('./api');

var last = [];

function isArrayEquals(a=[], b=[]) {
  if (a.length === b.length) {
    for (let x = 0; x < a.length; x++)
      if (a[x] != b[x]) return false;
    return true;
  } else return false;
}

function add(home) {
  last.push(home);
  return api.addMetadata('homes', home);
}

function remove(home) {
  last = last.filter(h => h != home);
  return api.removeMetadata('homes', home);
}

async function coroutine() {
  const homes = (await db.pluck('SELECT home FROM vrp_homes_permissions WHERE `owner`=1', 'home'));
  if (!isArrayEquals(homes.sort(), last.sort())) {
    last = homes;
    await api.setMetadata('homes', last);
  }
}

db.onConnect(() => {
  db.queryTables().then(() => {
    if (db.tables().includes('vrp_homes_permissions')) {
      setInterval(coroutine, 10000);
      console.log('Monitorando casas disponíveis em vrp_homes_permissions...');
    } else console.log('Não foi encontrado vrp_homes_permissions');
  }).catch(err => console.error(err))
});

module.exports = { add, remove, coroutine };