// tools/test_seed.js
const { getDb } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');

const db = getDb();
seedDatabase(db, true);

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
const ticketCount = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
const linkCount = db.prepare('SELECT COUNT(*) as count FROM ticket_links').get().count;
const sideConvoCount = db.prepare('SELECT COUNT(*) as count FROM side_conversations').get().count;

console.log('Seed completed successfully!');
console.log('Users:', userCount);
console.log('Tickets:', ticketCount);
console.log('Links:', linkCount);
console.log('Side Conversations:', sideConvoCount);
