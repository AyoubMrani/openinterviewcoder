const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Markets to create folders for
const MARKETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'US30', 'NAS100', 'SPX500'];

function setupDataFolders() {
  const dataPath = path.join(app.getPath('userData'), 'data');
  
  console.log('Setting up data folders...');
  console.log('Base path:', dataPath);
  
  MARKETS.forEach(market => {
    const marketPath = path.join(dataPath, market);
    
    if (!fs.existsSync(marketPath)) {
      fs.mkdirSync(marketPath, { recursive: true });
      console.log(`✓ Created: ${market}`);
    } else {
      console.log(`✓ Exists: ${market}`);
    }
  });
  
  console.log('\nData folders ready!');
  console.log(`\nTo add charts, place your PNG files in:`);
  console.log(`${dataPath}\\[MARKET]\\daily.png`);
  console.log(`${dataPath}\\[MARKET]\\1hour.png`);
  console.log(`\nExample:`);
  console.log(`${dataPath}\\XAUUSD\\daily.png`);
  console.log(`${dataPath}\\XAUUSD\\1hour.png`);
}

module.exports = { setupDataFolders };