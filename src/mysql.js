const mysql = require("mysql");
const config = require("../config.json");
const { addWebhookBatch } = require('./api');
const utils = require('./utils');

let connection = undefined;

module.exports.ping = (cb) => {
  if (connection) connection.ping(cb);
};

module.exports.connect = () => (new Promise((resolve) => {
  connection = mysql.createConnection(config.mysql);
  connection.connect(err => resolve(err));
}));

module.exports.isConnected = () => connection && connection.state == 'connected';

const sql = (sql, args=[], ignore=false) => new Promise((resolve, reject) => {
  if (!ignore) addWebhookBatch(`\`\`\`sql\n${sql}\n/* [${args.join(',')}] */\`\`\``);
  connection.query(sql, args, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});
module.exports.sql = sql;

module.exports.after = async (days, command) => {
  if (command instanceof Function) {
    command = command.toString().replace(/(\(\))|=>/g, '').trim();
  }
  const old = await findAppointment(command);
  if (old && old.expires_at.getTime() > Date.now()) {
    const expires_at = new Date(old.expires_at.getTime() + (days*86400000));
    return sql("UPDATE fstore_appointments SET expires_at = ? WHERE id=?", [expires_at, old.id], true);
  }
  return createAppointment(command, utils.after(days));
}

module.exports.pluck = async (SQL, column, args=[], ignore=true) => {
  const rows = await sql(SQL, args, ignore);
  return rows.map(r => r[column]);
}

module.exports.insert = (table, data) => {
  const marks = Object.values(data).map(s=>'?').join(',');
  const cmd = `INSERT INTO ${table} (${Object.keys(data).join(',')}) VALUES (${marks})`;
  return sql(cmd, Object.values(data));
}

module.exports.createAppointmentsTable = () => (
  sql("CREATE TABLE IF NOT EXISTS fstore_appointments (id BIGINT NOT NULL AUTO_INCREMENT, command VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id))", [], true)
);

/**
 * @param {string} command
 * @param {Date} expires_at
 */
const createAppointment = (command, expires_at) => {
  const args = [command, new Date(), expires_at];
  return sql("REPLACE INTO fstore_appointments (command,created_at,expires_at) VALUES (?,?,?)", args, true);
};

module.exports.createAppointment = createAppointment;

/**
 * @returns {Promise<Array<{id:number;command:string;created_at:Date;expires_at:Date}>>}
 */
module.exports.getAppointments = (all=false) => {
  if (all)
    return sql("SELECT * FROM fstore_appointments", [], true);
  else
    return sql("SELECT * FROM fstore_appointments WHERE expires_at < ?", [new Date()], true);
}

module.exports.deleteAppointments = (ids) => {
  if (!Array.isArray(ids)) ids = [ids];
  const marks = ids.map(s=>'?').join(',');
  return sql(`DELETE FROM fstore_appointments WHERE id IN (${marks})`, ids, true);
}

/**
 * 
 * @param {string} command
 * @returns {Promise<{id:number;command:string;created_at:Date;expires_at:Date;}>} 
 */
const findAppointment = async (command) => {
  const [row] = await sql("SELECT * FROM fstore_appointments WHERE command = ?", [command], true);
  return row || undefined;
}

module.exports.getDatatable = async (id) => {
  const [row] = await sql("SELECT dvalue FROM vrp_user_data WHERE user_id=? AND dkey='vRP:datatable'", [id], true);
  return row ? JSON.parse(row.dvalue) : null; 
}

module.exports.setDatatable = (id, value) => {
  return sql(`UPDATE vrp_user_data SET dvalue=? WHERE user_id=? AND dkey='vRP:datatable'`, [JSON.stringify(value), id], true);
}