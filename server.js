/**
 * Deriv Signal Engine — Server
 * Reads .env, injects app_id into frontend, serves static files.
 * No token required — market data works unauthenticated.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3030;
const APP_ID = process.env.DERIV_APP_ID || '1089';

const indexPath = path.join(__dirname, 'public', 'index.html');

app.get('/', (req, res) => {
  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace(
    '/*__CONFIG__*/',
    `window.__DC__={appId:${JSON.stringify(APP_ID)}};`
  );
  res.send(html);
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

function tryListen(port) {
  const srv = app.listen(port, () => {
    console.log(`\n  Deriv Signal Engine — http://localhost:${port}\n`);
  });
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + 10) tryListen(port + 1);
    else { console.error(`Port ${port} in use`); process.exit(1); }
  });
}
tryListen(PORT);
