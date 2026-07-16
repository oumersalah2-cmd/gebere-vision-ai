const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder'
);

const LOCAL_DB_PATH = path.join(__dirname, '..', '..', 'local_db.json');

// Helper to read local JSON database
function readLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('⚠️ Error reading local DB:', err.message);
  }
  return { farmers: [], diagnoses: [] };
}

// Helper to write local JSON database
function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Error writing local DB:', err.message);
  }
}

// DB wrappers with fallback mechanism
async function getFarmerLanguage(telegramId) {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .select('language')
      .eq('telegram_id', telegramId.toString())
      .limit(1);

    if (!error && data && data.length > 0) {
      return data[0].language || 'amharic';
    }
  } catch (err) {
    console.warn('⚠️ Supabase failed (getFarmerLanguage), falling back to local DB:', err.message);
  }

  // Fallback to local DB
  const db = readLocalDb();
  const farmer = db.farmers.find(f => f.telegram_id === telegramId.toString());
  return farmer ? farmer.language || 'amharic' : 'amharic';
}

async function registerFarmer(telegramId, name) {
  const telegramIdStr = telegramId.toString();
  try {
    const { data: existing, error: selectError } = await supabase
      .from('farmers')
      .select('*')
      .eq('telegram_id', telegramIdStr);

    if (!selectError && existing && existing.length > 0) {
      return existing[0];
    }

    const newFarmer = { telegram_id: telegramIdStr, name };
    const { data, error: insertError } = await supabase
      .from('farmers')
      .insert([newFarmer])
      .select();

    if (!insertError && data && data.length > 0) {
      console.log(`✅ Supabase: Registered farmer: ${name}`);
      return data[0];
    }
  } catch (err) {
    console.warn('⚠️ Supabase failed (registerFarmer), falling back to local DB:', err.message);
  }

  // Fallback to local DB
  const db = readLocalDb();
  let farmer = db.farmers.find(f => f.telegram_id === telegramIdStr);
  if (!farmer) {
    farmer = { telegram_id: telegramIdStr, name, language: 'amharic', created_at: new Date().toISOString() };
    db.farmers.push(farmer);
    writeLocalDb(db);
    console.log(`✅ Local DB: Registered farmer: ${name}`);
  }
  return farmer;
}

async function updateFarmerLanguage(telegramId, language) {
  const telegramIdStr = telegramId.toString();
  try {
    const { error } = await supabase
      .from('farmers')
      .update({ language })
      .eq('telegram_id', telegramIdStr);

    if (!error) {
      console.log(`✅ Supabase: Updated language for ${telegramIdStr} to ${language}`);
      // Also update local copy for consistency
      const db = readLocalDb();
      const farmer = db.farmers.find(f => f.telegram_id === telegramIdStr);
      if (farmer) {
        farmer.language = language;
        writeLocalDb(db);
      }
      return;
    }
  } catch (err) {
    console.warn('⚠️ Supabase failed (updateFarmerLanguage), falling back to local DB:', err.message);
  }

  // Fallback to local DB
  const db = readLocalDb();
  let farmer = db.farmers.find(f => f.telegram_id === telegramIdStr);
  if (!farmer) {
    farmer = { telegram_id: telegramIdStr, name: 'Farmer', language, created_at: new Date().toISOString() };
    db.farmers.push(farmer);
  } else {
    farmer.language = language;
  }
  writeLocalDb(db);
  console.log(`✅ Local DB: Updated language for ${telegramIdStr} to ${language}`);
}

async function saveDiagnosis(telegramId, diagnosis) {
  const telegramIdStr = telegramId.toString();
  const newDiagnosis = {
    farmer_id: telegramIdStr,
    gemini_result: diagnosis,
    crop_type: 'unknown',
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase
      .from('diagnoses')
      .insert([newDiagnosis]);

    if (!error) {
      console.log('✅ Supabase: Saved diagnosis');
      // Also sync to local copy
      const db = readLocalDb();
      db.diagnoses.push(newDiagnosis);
      writeLocalDb(db);
      return;
    }
  } catch (err) {
    console.warn('⚠️ Supabase failed (saveDiagnosis), falling back to local DB:', err.message);
  }

  // Fallback to local DB
  const db = readLocalDb();
  db.diagnoses.push(newDiagnosis);
  writeLocalDb(db);
  console.log('✅ Local DB: Saved diagnosis');
}

async function updateLatestFeedback(telegramId, feedback) {
  const telegramIdStr = telegramId.toString();
  try {
    // Attempting query update via supabase using order + limit (not fully standard for update, so we update latest by sorting locally or matching)
    // First retrieve latest diagnosis ID or timestamp
    const { data: latest, error: fetchError } = await supabase
      .from('diagnoses')
      .select('id')
      .eq('farmer_id', telegramIdStr)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!fetchError && latest && latest.length > 0) {
      const { error } = await supabase
        .from('diagnoses')
        .update({ feedback })
        .eq('id', latest[0].id);

      if (!error) {
        console.log(`✅ Supabase: Updated feedback to ${feedback}`);
        // Sync locally
        const db = readLocalDb();
        const localDiagnoses = db.diagnoses.filter(d => d.farmer_id === telegramIdStr);
        if (localDiagnoses.length > 0) {
          // Sort by created_at descending
          localDiagnoses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          localDiagnoses[0].feedback = feedback;
          writeLocalDb(db);
        }
        return;
      }
    }
  } catch (err) {
    console.warn('⚠️ Supabase failed (updateLatestFeedback), falling back to local DB:', err.message);
  }

  // Fallback to local DB
  const db = readLocalDb();
  const localDiagnoses = db.diagnoses.filter(d => d.farmer_id === telegramIdStr);
  if (localDiagnoses.length > 0) {
    localDiagnoses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    localDiagnoses[0].feedback = feedback;
    writeLocalDb(db);
    console.log(`✅ Local DB: Updated feedback to ${feedback}`);
  } else {
    console.warn('⚠️ No local diagnosis found to apply feedback to');
  }
}

module.exports = {
  supabase,
  getFarmerLanguage,
  registerFarmer,
  updateFarmerLanguage,
  saveDiagnosis,
  updateLatestFeedback
};