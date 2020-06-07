const { lua } = require('./src/lua');
const { connect, ping, sql, after, ...database } = require('./src/mysql');
const vrp = require('./src/vrp');
const api = require('./src/api');
const utils = require('./src/utils');
const Warning = require('./src/Warning');
const config = require('./config.json');
const { update:updateResource } = require('./src/updater');

async function start() {
  console.log('Conectando no banco de dados...');

  let error = undefined;
  while (error = await connect()) {
    console.error('Falha ao conectar no banco de dados, tentando novamente...');
    utils.printError(error);
  }

  console.log(`

   ______ _______      ________          __  __    _____ _______ ____  _____  ______ 
  |  ____|_   _\\ \\    / /  ____|        |  \\/  |  / ____|__   __/ __ \\|  __ \\|  ____|
  | |__    | |  \\ \\  / /| |__   ______  | \\  / | | (___    | | | |  | | |__) | |__   
  |  __|   | |   \\ \\/ / |  __| |______| | |\\/| |  \\___ \\   | | | |  | |  _  /|  __|  
  | |     _| |_   \\  /  | |____         | |  | |_ ____) |  | | | |__| | | \\ \\| |____ 
  |_|    |_____|   \\/   |______|        |_|  |_(_)_____/   |_|  \\____/|_|  \\_\\______|
  `);
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
  let sales = await api.packages();
  sales.forEach(s => s.commands = s.commands.map(c => c.replace(/\?/g, s.player)));

  if (config.requireOnlineToDelivery) {
    for (let s of sales)
      if (!(await vrp.isOnline(s.player)))
        sales = sales.filter(sale => sale.id != s.id);
  }
  
  for (const sale of sales) {
    api.addWebhookBatch(`Processando venda número ${sale.id}`);
    
    const source = await vrp.getSource(sale.player);
    const fullname = await vrp.getName(sale.player);
    if (fullname === null) {
      api.addWebhookBatch(`\`\`\`diff\n- ERRO: O jogador ${sale.player} não existe\`\`\``);
      await api.sendWebhookBatch();
      continue;
    }
    const product = Object.values(sale.products).join(' & ');
    setImmediate(() => sendTitle(source, fullname, product));

    for (const command of sale.commands) {
      api.addWebhookBatch(`\`\`\`js\n${command}\`\`\``);
      try {
        const response = await eval(command);
        if (response instanceof Warning) {
          api.addWebhookBatch(`\`\`\`diff\n- AVISO: ${response.message}\`\`\``);
        }
      } catch (error) {
        console.error('Falha ao executar o comando: '+command);
        utils.printError(error);
        api.addWebhookBatch('Falha ao executar');
        api.addWebhookBatch('```diff\n'+ `- ${error.message}` +'```')
        continue;
      }
    }
    await api.sendWebhookBatch();
  }
  if (sales.length > 0) 
    await api.delivery(sales.map(s=>s.id));

  const refunds = await api.refunds();
  refunds.forEach(s => s.commands = s.commands.map(c => c.replace(/\?/g, s.player)));

  for (let refund of refunds) {
    api.addWebhookBatch(`Processando reembolso número ${sale.id}`);
    for (let command of refund.commands) {
      api.addWebhookBatch(`\`${command}\``);
      try {
        const response = await eval(command);
        if (response instanceof Warning) {
          api.addWebhookBatch(`\`\`\`diff\n- AVISO: ${response.message}\`\`\``);
        }
      } catch (error) {
        console.error('Falha ao executar o comando: '+command);
        utils.printError(error);
        api.addWebhookBatch('Falha ao executar');
        api.addWebhookBatch('```diff\n'+ `- ${error.message}` +'```')
        continue;
      }
    }
    await api.sendWebhookBatch();
  }
  if (refunds.length > 0) 
    await api.punish(refunds.map(s=>s.id));

  await api.players(GetNumPlayerIndices());

  const appointments = await database.getAppointments();

  if (appointments.length > 0) {
    api.addWebhookBatch(`Processando ${appointments.length} agendamento${appointments.length>1?'s':''}`);
    for (let a of appointments) {
      api.addWebhookBatch(`\`\`\`js\n${a.command}\n/* ${utils.formatDate(a.expires_at)} */\`\`\``);
      await eval(a.command);
    }
    await api.sendWebhookBatch();
    await database.deleteAppointments(appointments.map(i=>i.id));
  }
}

const coroutine = () => fetch().catch(err => {
  console.error('Falha na corotina: '+err.name);
  utils.printError(err);
});

RegisterCommand('fivemstore', async (source, args) => {
  if (await isAdmin(source)) {
    if (args.length == 0) {
      setImmediate(() => sendMessage(source, 'Digite algum comando'));
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

const cooldown = {};

RegisterCommand('vip', async (source, args) => {
  if (cooldown[source] && cooldown[source] > Date.now()) {
    setImmediate(() => emitNet('Notify', source, 'negado', 'Aguarde para usar este comando novamente'));
  } else if (source == 0 && args.length == 0) {
    console.log('Digite o id do jogador');
  } else {
    const admin = await isAdmin(source);
    const sender = (source == 0 ? 0 : await vrp.getId(source));
    const target = (admin && args.length > 0) ? parseInt(args[0]) : sender;
    if (isNaN(target)) {
      setImmediate(() => sendMessage(source, 'Número inválido', [220, 53, 69]));
      return;
    }

    const groups = await getGroups(target);
    setImmediate(() => {
      if (groups.length > 0) {
        if (source != 0) {
          const html = groups.map(([group,date]) => `O grupo <b>"${group}"</b> expira em ${date}`).join('<br>');
          emitNet('chat:addMessage', source, {
            template: `
            <div style="display:flex;align-items:center;justify-content:center;padding:10px;margin:5px 0;background-image: linear-gradient(to right, rgba(91, 192, 222, 1) 3%, rgba(91, 192, 222, 0) 95%);border-radius: 5px;">
              ${html}
            </div>`,
          });
        }
      } else if (target != sender) {
        sendMessage(source, 'Este jogador não tem grupos', [220, 53, 69]);
      } else {
        emitNet('chat:addMessage', source, {
          template: `
          <div style="display:flex;align-items:center;justify-content:center;padding:10px;margin:5px 0;background-image: linear-gradient(to right, rgba(217, 83, 79, 1) 3%, rgba(217, 83, 79, 0) 95%);border-radius: 5px;">
            Você não possui nenhum vip ativo
          </div>`,
        });
      }
    });
  }
});

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
  const id = await vrp.getId(source);
  return vrp.hasPermission(id, "admin.permissao");
}

const sendMessage = (source, msg, color=[255,255,255]) => {
  if (source == 0) {
    console.log(msg);
  } else {
    emitNet('chatMessage', source, '', color, msg);
  }
};

function sendTitle(source, jogador, produto) {
  const { nui, chat } = config;
  if (nui.enabled && source) {
    const title = eval('`'+nui.title+'`');
    const subtitle = eval('`'+nui.subtitle+'`');
    emitNet('fivemstore-title', source, title, subtitle);
  }
  if (chat.enabled && (source || chat.global)) {
    const text = eval('`'+chat.format+'`');
    emitNet('chat:addMessage', chat.global ? -1 : source, {
      template: `<div style="display:flex;align-items:center;justify-content:center;padding:10px;margin:5px 0;background-image: linear-gradient(to right, rgba(255, 168, 82,1) 3%, rgba(255, 168, 82,0) 95%);border-radius: 5px;"><img width="24" style="float: left;" src="https://five-m.store/favicon.ico">${text}</div>`,
    });
  }
}

start().catch(utils.printError);