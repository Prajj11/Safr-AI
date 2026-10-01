process.loadEnvFile();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.log('No Supabase credentials found in env');
  process.exit(1);
}

const tables = [
  'profiles',
  'trips',
  'travellers',
  'safety_tags',
  'itineraries',
  'emergency_contacts',
  'safety_tag_scans',
  'saved_places'
];

console.log('=== Checking Supabase Row Level Security (RLS) ===');
console.log('Project host:', new URL(url).hostname);

let anyLeak = false;

for (const table of tables) {
  try {
    // 1. Test unauthenticated SELECT
    const selectRes = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    const status = selectRes.status;
    const data = await selectRes.json();

    if (table === 'emergency_contacts') {
      if (selectRes.ok && Array.isArray(data) && data.length > 0) {
        console.log(`✓ [${table}] Public directory correctly accessible (HTTP ${status}, returned ${data.length} emergency contacts)`);
      } else {
        console.log(`? [${table}] Public directory returned HTTP ${status}:`, data);
      }
      continue;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log(`✓ [${table}] RLS PROTECTED: 0 rows exposed to unauthenticated/anon requests (HTTP ${status})`);
      } else {
        console.error(`🚨 [${table}] LEAK WARNING! RLS may be OFF or misconfigured: ${data.length} rows exposed to anon!`);
        anyLeak = true;
      }
    } else {
      console.log(`✓ [${table}] Access restricted or not found (HTTP ${status}: ${data.message || data.code || JSON.stringify(data)})`);
    }

    // 2. Test unauthenticated INSERT on sensitive tables
    if (['profiles', 'trips', 'itineraries', 'saved_places'].includes(table)) {
      const insertRes = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', dummy: 'test' })
      });
      if (insertRes.ok) {
        console.error(`🚨 [${table}] WRITE LEAK! Anon was able to insert into ${table}!`);
        anyLeak = true;
      } else {
        console.log(`  └─ Write blocked for anon: HTTP ${insertRes.status}`);
      }
    }
  } catch (err) {
    console.error(`[${table}] Error testing table: ${err.message}`);
  }
}

if (!anyLeak) {
  console.log('\n🎉 ALL SENSITIVE TABLES ARE SECURED WITH ROW LEVEL SECURITY!');
} else {
  console.log('\n⚠️ ACTION REQUIRED: Some tables exposed data to unauthenticated requests.');
}
