const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const api = require('./routes/api');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false
    }
  })
);

// Owner console lives at /admin; the public storefront is index.html at /.
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', api);
app.use('/api', notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Inventory app running at http://localhost:${port}`);
});
