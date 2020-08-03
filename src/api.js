const axios = require('axios').default;
const { formatDate } = require('./utils');

const { token, webhook:webhook_url } = require('./config');

const hasWebhook = webhook_url.toLowerCase().includes("discordapp.com/api/webhooks");


const endpoint = axios.create({
  baseURL: `https://five-m.store/api/${token}`
});

const api = {};
const batch = [];

/**
 * @returns {Promise<Array<{id:number;player:number;commands:string[];products: object>>}
 */
api.packages = async () => {
  const { data } = await endpoint.get('/packages');
  return data;
}

/**
 * @returns {Promise<Array<{id:number;player:number;commands:string[];}>>}
 */
api.refunds = async () => {
  const { data } = await endpoint.get('/refunds');
  return data;
}

api.punish = (ids)  => endpoint.get(`/punish?ids=${ids.join(',')}`);
api.delivery = (ids) => endpoint.get(`/delivery?ids=${ids.join(',')}`);
api.players = (online) => endpoint.patch(`/players`, { online });

api.addWebhookBatch = (content) => {
  if (hasWebhook && batch.join('\n').length >= 1750) {
    api.sendWebhookBatch();
    batch.push('Continuação...');
  }
  batch.push(content);
}

api.sendWebhook = (content, color) => {
  if (!hasWebhook) {
    const formatted = content.replace(/(```[a-z]+\n|```)/g, '');
    console.log(formatted);
    return Promise.resolve();
  }
  else return endpoint.post(webhook_url, {
    embeds: [
      {
        title: formatDate(),
        description: content,
        color: color
      }
    ]
  }).catch(err => {
    if (err.response) {
      const status = err.response.status;
      console.error('Falha ao enviar webhook para o discord (Erro '+err.response.status+')');
      if (status === 429)
        console.error('O erro 429 é comum quando ocorre muitas entregas simultaneas');
      else
        console.error('Este erro é desconhecido pela nossa equipe, por favor envie para nós =]');
    } else console.error('Erro ao enviar webhook para o discord, não foi obtido uma resposta do servidor...');
  });
}

api.sendWebhookBatch = () => {
  const text = batch.join('\n');
  batch.splice(0, batch.length);
  return api.sendWebhook(text, 0xF1F1F1);
}

module.exports = api;