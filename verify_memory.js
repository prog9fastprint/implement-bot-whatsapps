import db from './src/database/client.js';
import { saveUserMemory, loadUserMemory } from './src/services/memoryService.js';

async function testMemory() {
  try {
    const res = await db.query('SELECT id FROM users LIMIT 1');
    if (res.rowCount === 0) {
      console.error('No users found in database.');
      return;
    }
    const userId = res.rows[0].id;
    console.log('Using userId:', userId);
    
    console.log('Saving memory...');
    await saveUserMemory(userId, 'preference', 'fav_color', 'biru');
    console.log('Saved. Querying...');
    
    const mem = await loadUserMemory(userId, 'warna apa yang saya suka?');
    console.log('Result:', JSON.stringify(mem, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

testMemory();
