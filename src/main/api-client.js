const axios = require('axios');
const store = require('./config-store');

function client() {
  return axios.create({
    baseURL: store.get('apiBaseUrl'),
    headers: {
      Authorization: `Bearer ${store.get('token')}`,
      Accept: 'application/json',
    },
  });
}

async function login(email, password) {
  const res = await axios.post(`${store.get('apiBaseUrl')}/login`, { email, password });

  // ASUMSI: shape response login = { success, message, data: { token, admin } }
  // mengikuti pola BaseController->sendResponse(). TOLONG DIVALIDASI —
  // kalau field token-nya beda nama/lokasi, ganti baris di bawah ini saja.
  const token = res.data?.data?.token;
  if (!token) throw new Error('Login berhasil tapi token tidak ditemukan di response.');

  store.set('token', token);
  return res.data;
}

async function fetchActiveEvents() {
  const res = await client().get('/events', { params: { status: 'active' } }); // BUKAN /camera/events
  return res.data?.data?.data ?? res.data?.data ?? [];
}

async function registerStation({ eventId, name, printerName }) {
  const res = await client().post('/print-stations', { // BUKAN /camera/print-stations
    event_id: eventId,
    name,
    printer_name: printerName,
  });

  const station = res.data?.data;
  store.set('stationId', station.id);
  store.set('eventId', eventId);
  store.set('printerName', printerName);
  return station;
}

const fs = require('fs');

async function claimPrintRequest(printRequestId) {
  const res = await client().post(`/print-requests/${printRequestId}/claim`, {
    print_station_id: store.get('stationId'),
  });
  return res.data?.data;
}

async function reportStatus(printRequestId, status, notes = null) {
  const res = await client().patch(`/print-requests/${printRequestId}/report`, {
    print_station_id: store.get('stationId'),
    status,
    notes,
  });
  return res.data?.data;
}

async function downloadZip(printRequestId, destPath) {
  const res = await client().get(`/print-requests/${printRequestId}/download`, {
    responseType: 'stream',
  });

  const writer = fs.createWriteStream(destPath);
  res.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function heartbeat() {
  const stationId = store.get('stationId');
  if (!stationId) return;
  await client().post(`/print-stations/${stationId}/heartbeat`);
}

module.exports = {
  login, fetchActiveEvents, registerStation,
  claimPrintRequest, reportStatus, downloadZip, heartbeat, // tambahan
};