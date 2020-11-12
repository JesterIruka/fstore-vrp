const db = require('./mysql');
const api = require('./api');
const config = require('./config');

const table = config.snowflake.homes || (config.snowflake.database_prefix || 'vrp') + '_homes_permissions';
var last = {};

function hasChanges(a = {}, b = {}) {
  for (let k in a) if (a[k] != b[k]) return true;
  for (let k in b) if (b[k] != a[k]) return true;
  return false;
}

function add(home, user_id) {
  last[home] = user_id;
  return api.addMetadata('homes', { home: user_id });
}

function remove(home) {
  delete last[home];
  return api.removeMetadata('homes', { home: null });
}

async function coroutine() {
  const homes = {};

  const rows = await db.sql(`SELECT user_id,home FROM ${table} WHERE owner=1`, [], true);
  for (let { user_id, home } of rows)
    homes[home] = user_id;

  if (hasChanges(homes, last))
    await api.setMetadata('homes', last = homes);
}

db.onConnect(() => {
  db.queryTables().then(() => {
    if (db.tables().includes(table)) {
      setInterval(coroutine, 10000);
      console.log(`Monitorando casas disponíveis em ${table}...`);
    }
  }).catch(err => console.error(err.message))
});

module.exports = { add, remove, coroutine };