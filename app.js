const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { auth, requiresAuth } = require('express-openid-connect');
const axios = require('axios');
const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
require('dotenv').config();


const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SECRET,
  baseURL: process.env.BASEURL,
  clientID: process.env.CLIENTID,
  issuerBaseURL: process.env.ISSUER,
};

const jwtCheck = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${process.env.ISSUER}/.well-known/jwks.json`
  }),
  audience: 'https://create-ticket',
  baseURL: process.env.ISSUER,
  algorithms: ['RS256']
});


const dbFile = './database/app.db';

// Check if the database file exists
if(fs.existsSync(dbFile)) {
  fs.unlinkSync(dbFile);
} 
const db = new Database(dbFile);

const query = `
    create table tickets (
      id string primary key,
      vatin string,
      name string,
      surname string,
      timestamp datetime default (datetime('now','+2 hour'))
    )
  `;

db.exec(query);


const app = express();

app.use(express.json());
app.use(auth(config));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.get('/', (req, res) => {

  const entries = db.prepare('select count(*) as count from tickets').get();

  res.render('homepage', { ticketCount: entries.count });
});

app.get('/create', jwtCheck, async (req, res) => {

  const { vatin, name, surname } = req.body;

  if (!vatin || !name || !surname) {
    return res.status(400).json({ error: 'vatin, name, and surname are required' });
  }

  const entries = db.prepare('select count(*) as count from tickets where vatin ='+ vatin).get();
  if(entries.count >= 3) {
    return res.status(400).json('Max number of tickets for this vatin reached');
  }
  
  const id = crypto.randomUUID();

  const insert = db.prepare('insert into tickets (id, vatin, name, surname) values (?, ?, ?, ?)');
  insert.run(id, vatin, name, surname);
  
  const url = "https://quickchart.io/chart?cht=qr&chs=300x300&chl=" + "https://web2lab1-7e11.onrender.com/ticket/" + id;

  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    res.set('Content-Type', 'image/png');
    res.send(response.data);
  } catch (error) {
    res.status(500).send('Error generating QR code');
  }

});

app.get('/ticket/:id', requiresAuth(), (req, res) => {
  const id = req.params.id;
  const user = req.oidc.user

  const ticket = db.prepare('select * from tickets where id = ?').get(id);
  if(!ticket) {
    return res.status(404).send('Ticket not found');
  }
  res.render('ticket-info', { user: user.name, ticket: ticket });
});


app.use('*', (req, res) => {
  res.redirect('/');
});

app.listen(3000, () => {
  console.log('Server started on port 3000');
});