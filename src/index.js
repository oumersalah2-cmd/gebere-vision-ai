const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

const db = require('./db/database');
const bot = require('./services/bot');

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Welcome to Gebere Vision AI!');
});

app.listen(PORT, () => {
  console.log(`🚀 Gebere Vision AI server is running on port ${PORT}`);
});