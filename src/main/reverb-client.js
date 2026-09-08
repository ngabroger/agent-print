const axios = require('axios');
const store = require('./config-store');

/**
 * pusher-js versi terbaru sudah auto-detect environment (browser/Node),
 * gak perlu path terpisah pusher-js/node lagi seperti versi lama —
 * tapi tetap butuh 'ws' terpasang sebagai dependency biar transport
 * WebSocket-nya ada (di browser, WebSocket API native tersedia; di Node,
 * enggak, harus disuntik lewat package ws).
 */
const Pusher = require('pusher-js');

let pusherInstance = null;
let channelInstance = null;

/**
 * Reverb self-hosted → wsHost/wsPort nunjuk domain sendiri (bukan cluster
 * Pusher.com), forceTLS true karena production lewat Nginx+SSL. authorizer
 * custom WAJIB karena kita autentikasi pakai Bearer token (Sanctum), bukan
 * cookie session — default pusher-js authorizer cuma kirim cookie.
 */
function connect(onPrintRequestCreated) {
  const eventId = store.get('eventId');
  const token = store.get('token');

  pusherInstance = new Pusher(store.get('reverbKey'), {
    wsHost: store.get('reverbHost'),
    wsPort: store.get('reverbPort'),
    wssPort: store.get('reverbPort'),
    forceTLS: store.get('reverbScheme') === 'https',
    enabledTransports: ['ws', 'wss'],
    cluster: '',
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        axios
          .post(store.get('authEndpoint'), { socket_id: socketId, channel_name: channel.name }, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          })
          .then((res) => callback(false, res.data))
          .catch((err) => callback(true, err));
      },
    }),
  });

  pusherInstance.connection.bind('connected', () => console.log('[Reverb] Terhubung.'));
  pusherInstance.connection.bind('disconnected', () => console.log('[Reverb] Terputus, retry otomatis.'));
  pusherInstance.connection.bind('error', (err) => console.error('[Reverb] Error:', err?.error?.data ?? err));

  channelInstance = pusherInstance.subscribe(`private-event.${eventId}.print-stations`);
  channelInstance.bind('print-request.created', onPrintRequestCreated);
  channelInstance.bind('pusher:subscription_error', (status) => {
    console.error('[Reverb] Gagal subscribe channel, status:', status);
  });
}

function disconnect() {
  pusherInstance?.disconnect();
}

module.exports = { connect, disconnect };