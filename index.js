const axios = require('axios');
const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const tgBot = new TelegramBot(process.env.TG_API_KEY, { polling: false });

let db;

Promise.all([import('lowdb'), import('lowdb/node')]).then(
  ([{ LowSync }, { JSONFileSync }]) => {
    db = new LowSync(new JSONFileSync('db.json'), {});
  }
);

async function main() {
  db.read();
  const vuelos = db.data.vuelos;
  const [vueloHoy] = vuelos.filter(
    ({ date, status }) =>
      moment(date).isSameOrBefore(moment(), 'days') && status !== 'landed'
  );

  if (!vueloHoy) return;
  if (!vueloHoy.eta) await getData(vueloHoy);
  if (moment(vueloHoy.eta).utc(true).diff(moment(), 'minutes') > 30) return;
  await getData(vueloHoy);
  if (vueloHoy.status !== 'landed') return;

  await tgBot.sendMessage(
    process.env.TG_CHANNEL,
    `Merche acaba de aterrizar en ${vueloHoy.airport}, ${vueloHoy.city}, ${
      vueloHoy.country
    } a las ${moment(vueloHoy.arrival).format('HH:mm')} (hora local)`
  );
}

async function getData(vueloHoy) {
  const fligthData = await getFlight(vueloHoy.code);
  vueloHoy.eta = fligthData.arr_estimated_utc || fligthData.arr_time_utc;
  vueloHoy.airport = fligthData.arr_name;
  vueloHoy.city = fligthData.arr_city;
  vueloHoy.country = fligthData.arr_country;
  vueloHoy.arrival = fligthData.arr_actual;
  vueloHoy.status = fligthData.status;
  db.write();
}

const getFlight = async (flightNumber) => {
  const { data } = await axios
    .get(
      `https://airlabs.co/api/v9/flight?flight_iata=${flightNumber}&api_key=${process.env.AIRLABS_API_KEY}`
    )
    .catch(() => ({ data: {} }));
  return data?.response || {};
};

setInterval(main, 5 * 1000 * 60);
setTimeout(main, 2 * 1000);
