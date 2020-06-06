const unzipper = require('unzipper');
const axios = require('axios').default;

// const folder = GetResourcePath(GetCurrentResourceName());
const folder = 'G:\\cdpbase\\server-data\\resources\\fstore';

const repository = 'https://github.com/JesterIruka/fstore-vrp/archive/master.zip';

async function update() {
  const response = await axios.get(repository, {responseType: 'arraybuffer'});
  const zip = await unzipper.Open.buffer(response.data);
  console.log(zip.files.map(f => f.path));
}

update();
