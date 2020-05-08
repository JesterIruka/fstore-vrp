const mysql = require('mysql');

const config = require('./config.json');

const {host,port,database,user,password} = config;

const pool = mysql.createPool({host,port,database,user,password});

pool.getConnection((err, link) => {
  if (err) console.error('Falha ao se conectar com o banco de dados '+err.message);
  else {
    link.query("CREATE TABLE IF NOT EXISTS fstore_online (id BIGINT)");
    link.query("TRUNCATE fstore_online");
    console.log('[FSTORE] Script inicializado com state '+link.state);
  }
});

function sql(line, values=[]) {
  pool.getConnection((err, link) => {
    if (err) console.error('Falha ao executar comando no banco de dados '+err.message);
    else {
      link.query(line, values);
      if (config.debug) console.log(`Executando SQL: "${line}" com valores (${values.join(',')})`);
    }
  });
}

on("vRP:playerJoin", function (user_id,source,name) {
  sql("REPLACE INTO fstore_online (id) VALUES (?)", [user_id]);
});

on("vRP:playerLeave", function (user_id,source) {
  sql('DELETE FROM fstore_online WHERE id=?', [user_id]);
});