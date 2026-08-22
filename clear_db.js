const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Clear collections
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
      await collection.deleteMany({});
      console.log('Cleared collection:', collection.collectionName);
    }
    
    // Delete local json files
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (file.startsWith('accounts') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(dataDir, file));
          console.log('Deleted local file:', file);
        }
      }
    }
    
    console.log('Database and local files reset to zero successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });
