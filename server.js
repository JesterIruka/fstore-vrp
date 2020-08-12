const { update: updateResource } = require('./src/updater');
const { lua } = require('./src/lua');
const { connect, ping, sql, after, ...database } = require('./src/mysql');
const proxy = require('./src/proxy');
const { vrp, esx } = proxy;
const api = require('./src/api');
const utils = require('./src/utils');
const Warning = require('./src/Warning');
const config = require('./config.json');

const snowflake = config.snowflake;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function start() {
  console.log('Conectando no banco de dados...');

  let error = undefined;
  while (error = await connect()) {
    console.error('Falha ao conectar no banco de dados, tentando novamente em 1 segundo...');
    utils.printError(error);
    await sleep(1000);
  }

  console.log(`

   ______ _______      ________          __  __    _____ _______ ____  _____  ______ 
  |  ____|_   _\\ \\    / /  ____|        |  \\/  |  / ____|__   __/ __ \\|  __ \\|  ____|
  | |__    | |  \\ \\  / /| |__   ______  | \\  / | | (___    | | | |  | | |__) | |__   
  |  __|   | |   \\ \\/ / |  __| |______| | |\\/| |  \\___ \\   | | | |  | |  _  /|  __|  
  | |     _| |_   \\  /  | |____         | |  | |_ ____) |  | | | |__| | | \\ \\| |____ 
  |_|    |_____|   \\/   |______|        |_|  |_(_)_____/   |_|  \\____/|_|  \\_\\______|
  `);
  if (proxy.isVRP) {
    console.log('Base detectada pelo script: VRP');
  } else if (proxy.isESX) {
    console.log('Base detectada pelo script: ESX');
  } else {
    console.log('Nenhuma base foi detectada pelo script');
    return StopResource(GetCurrentResourceName());
  }
  console.log('Five-M.Store >> Conectado ao banco de dados!');
  setInterval(() => ping((err) => {
    if (err) {
      console.error('Erro ao efetuar ping no MySQL', err.code)
      connect().then(err => console.log(err ? 'Falha ao reconectar...' : 'Conexão estabelecida novamente!'));
    }
  }), 10000);
  await database.createAppointmentsTable();
  await coroutine();
  setInterval(coroutine, 60000);
}

async function fetch() {
  const response = await api.fetch();

  const changed = [];

  const all = [...response.approved, ...response.refunded];
  if (proxy.isESX) all.forEach(s => s.player = 'steam:'+s.player);
  all.forEach(s => s.commands = s.commands.map(c => c.replace(/\?/g, s.player)));

  for (let sale of all) {
    if (sale.delivery) {
      if (config.requireOnlineToDelivery && !proxy.isOnline(sale.player)) continue;

      const source = await proxy.getSource(sale.player);
      let fullname = await proxy.getName(sale.player);
      if (fullname === undefined) {
        api.addWebhookBatch(`\`\`\`diff\n- ERRO: O jogador ${sale.player} não existe\`\`\``);
        await api.sendWebhookBatch();
        continue;
      } else if (fullname === null) {
        api.addWebhookBatch(`\`\`\`diff\n- AVISO: O jogador ${sale.player} não possui nome\`\`\``);
        fullname = 'Sem nome';
      }

      api.addWebhookBatch(`Processando entrega #${sale.id}`);

      const product = Object.values(sale.products).join(' & ');
      sendTitle(source, fullname, product);
    } else {
      api.addWebhookBatch(`Processando reembolso #${sale.id}`);
    }
    for (const command of sale.commands) {
      try {
        const response = await eval(command);
        if (response instanceof Warning) api.addWebhookBatch(`\`\`\`diff\n- AVISO: ${response.message}\`\`\``);
      } catch (error) {
        console.error('Falha ao executar o comando: ' + command);
        utils.printError(error);
        api.addWebhookBatch('Falha ao executar');
        api.addWebhookBatch('```diff\n' + `- ${error.message}` + '```')
        continue;
      }
    }
    await api.sendWebhookBatch();
    changed.push(sale.id);
  }

  if (changed.length > 0 || response.widgets['online_players']) {
    await api.callback(GetNumPlayerIndices(), changed);
  }

  const appointments = await database.getAppointments();

  if (appointments.length > 0) {
    api.addWebhookBatch(`Processando ${appointments.length} agendamento${appointments.length > 1 ? 's' : ''}`);
    for (let a of appointments) {
      api.addWebhookBatch(`\`\`\`js\n${a.command}\n/* ${utils.formatDate(a.expires_at)} */\`\`\``);
      await eval(a.command);
    }
    await api.sendWebhookBatch();
    await database.deleteAppointments(appointments.map(i => i.id));
  }
}

const coroutine = () => fetch().catch(err => {
  console.error('Falha na corrotina: ' + err.name);
  utils.printError(err);
});

RegisterCommand('fivemstore', async (source, args) => {
  if (await isAdmin(source)) {
    if (args.length == 0) {
      setImmediate(() => sendMessage(source, 'Digite algum comando'));
    } else if (args[0].toLowerCase() === 'trocarcarro' && proxy.isVRP) {
      const [_, user_id, from, to] = args;
      if (user_id && from && to) {
        const command = `vrp.removeVehicle("${user_id}"%`;
        await sql(`UDPATE fstore_appointments SET command=REPLACE(command, '${from}', '${to}') WHERE command LIKE ?`, [command]);
        await vrp.changeCar(user_id, from, to);
        setImmediate(() => sendMessage(source, 'Você trocou o carro do jogador ' + user_id));
      }
    } else {
      const toEval = args.join(' ');
      if (toEval.toLowerCase() == 'update') {
        updateResource();
        setImmediate(() => sendMessage(source, 'Script atualizado com sucesso!'));
        return;
      }
      try {
        await eval(toEval);
        setImmediate(() => sendMessage(source, 'O comando foi executado com sucesso'));
      } catch (err) {
        utils.printError(err);
      }
    }
  }
});

if (proxy.isVRP) {
  const cooldown = {};

  RegisterCommand('vip', async (source, args) => {
    if (cooldown[source] && cooldown[source] > Date.now()) {
      setImmediate(() => emitNet('Notify', source, 'negado', 'Aguarde para usar este comando novamente'));
    } else if (source == 0 && args.length == 0) {
      console.log('Digite o id do jogador');
    } else {
      const admin = await isAdmin(source);
      const sender = (source == 0 ? 0 : (proxy.isVRP ? await vrp.getId(source) : source));
      const target = (admin && args.length > 0) ? parseInt(args[0]) : sender;
      if (isNaN(target))
        return setImmediate(() => sendMessage(source, 'Número inválido', [220, 53, 69]));

      const groups = await getGroups(target);
      setImmediate(() => {
        if (groups.length > 0) {
          if (source != 0) {
            const html = groups.map(([group, date]) => `<p>O grupo <b>"${group}"</b> expira em ${date}</p>`).join('');
            emitNet('chat:addMessage', source, {
              template: `
            <div style="padding:10px;margin:5px 0;background-image: linear-gradient(to right, rgba(91, 192, 222, 1) 3%, rgba(91, 192, 222, 0) 95%);border-radius: 5px;">
              ${html}
            </div>`,
            });
          } else {
            groups.map(([group, date]) => console.log(`O grupo "${group}" expira em ${date}`))
          }
        } else if (source === 0 || sender != target) {
          sendMessage(source, 'Este jogador não tem grupos', [220, 53, 69]);
        } else {
          emitNet('chat:addMessage', source, {
            template: `
          <div style="padding:10px;margin:5px 0;background-image: linear-gradient(to right, rgba(217, 83, 79, 1) 3%, rgba(217, 83, 79, 0) 95%);border-radius: 5px;">
            Você não possui nenhum vip ativo
          </div>`,
          });
        }
      });
    }
  });
}

async function getGroups(id) {
  const groups = [];
  const rows = await sql(`SELECT * FROM fstore_appointments WHERE command LIKE ? OR command LIKE ? OR command LIKE ?`,
    [`vrp.removeGroup(${id},%`, `vrp.removeGroup("${id}",%`, `vrp.removeGroup('${id}',%`], true);
  for (const row of rows) {
    const group = row.command.split(',')[1].replace(')', '').trim();
    groups.push([group.replace(/["']/g, ""), utils.formatDate(row.expires_at)]);
  }
  return groups;
}

async function isAdmin(source) {
  if (source == 0) return true;
  if (proxy.isVRP) {
    const id = await proxy.getId(source);
    return proxy.hasPermission(id, "admin.permissao");
  } else {
    const steam_hex = await proxy.getSteamHex(source);
    const group = await proxy.esx.getGroup(steam_hex);
    return group === snowflake.esx.admin_group;
  }
}

const sendMessage = (source, msg, color = [255, 255, 255]) => {
  if (source == 0) {
    console.log(msg);
  } else {
    emitNet('chatMessage', source, '', color, msg);
  }
};

function sendTitle(source, jogador, produto) {
  const { nui, chat } = config;
  if (nui.enabled && source) {
    const title = eval('`' + nui.title + '`');
    const subtitle = eval('`' + nui.subtitle + '`');
    emitNet('fivemstore-title', source, title, subtitle);
  }
  if (chat.enabled && (source || chat.global)) {
    const text = eval('`' + chat.format + '`');
    emitNet('chat:addMessage', chat.global ? -1 : source, {
      template: `<div style="display:flex;align-items:center;justify-content:center;padding:10px;margin:5px 0;background-image: linear-gradient(to right, rgba(255, 168, 82,1) 3%, rgba(255, 168, 82,0) 95%);border-radius: 5px;"><img width="24" style="float: left;" src="https://five-m.store/favicon.ico">${text}</div>`,
    });
  }
}

start().catch(utils.printError);