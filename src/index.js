const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app =  express();
app.use(express.json());

const pool = require('./db/database');

const bot = require('./services/bot');

const PORT = process.env.PORT || 3000;

app.get(`/`, (req, res) => {
    res.send(`Welcome to Gebere Vision AI!`);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});