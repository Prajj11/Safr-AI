#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const API_BASE = 'https://antideploy.com/api/v1';

// 1. Locate config and token
function getToken() {
  const home = os.homedir();
  const configPath = path.join(home, '.antideploy', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No Antideploy token found at ${configPath}. Please authenticate via Antideploy device flow.`
    );
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.token) {
    throw new Error(`Token missing inside ${configPath}.`);
  }
  return config.token;
}

// 2. Parse .env if present
function getEnvSecrets() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // remove enclosing quotes if any
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val) {
      env[key] = val;
    }
  }
  return env;
}

// 3. Application setup or link
async function getOrCreateApplication(token, name = 'safr-goa', subdomain = 'safr-goa') {
  const appConfigPath = path.join(projectRoot, '.antideploy.json');
  if (fs.existsSync(appConfigPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
      if (existing.applicationId) {
        console.log(`[antideploy] Using existing application ID: ${existing.applicationId} (${existing.subdomain || existing.name})`);
        return existing;
      }
    } catch {
      // ignore parse error and recreate
    }
  }

  console.log(`[antideploy] Creating application "${name}" with subdomain "${subdomain}"...`);
  const res = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, subdomain }),
  });

  const data = await res.json();
  if (res.status === 201) {
    console.log(`[antideploy] Application created: ${data.name} (ID: ${data.applicationId})`);
    fs.writeFileSync(appConfigPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return data;
  } else if (res.status === 409 && data.applicationId) {
    console.log(`[antideploy] Application already exists (ID: ${data.applicationId}). Linking...`);
    const appInfo = { applicationId: data.applicationId, name, subdomain };
    fs.writeFileSync(appConfigPath, JSON.stringify(appInfo, null, 2) + '\n', 'utf8');
    return appInfo;
  } else {
    throw new Error(`Failed to create application: ${res.status} ${JSON.stringify(data)}`);
  }
}

// 4. Push environment secrets
async function syncSecrets(token, applicationId) {
  const env = getEnvSecrets();
  const keys = Object.keys(env);
  if (keys.length === 0) {
    console.log('[antideploy] No environment variables found to push.');
    return;
  }

  console.log(`[antideploy] Synchronizing ${keys.length} environment secrets (${keys.join(', ')})...`);
  const res = await fetch(`${API_BASE}/secrets?applicationId=${applicationId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ env }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[antideploy] Warning: Failed to push secrets: ${res.status} ${errText}`);
  } else {
    console.log('[antideploy] Environment secrets updated successfully.');
  }
}

// 5. Create tar archive
function createArchive() {
  const archivePath = path.join(projectRoot, 'antideploy-build.tar.gz');
  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
  }

  console.log('[antideploy] Creating project archive (excluding .git, node_modules)...');
  const tarCmd = `tar -czf "${archivePath}" --exclude=.git --exclude=node_modules --exclude=dist --exclude=antideploy-build.tar.gz .`;
  execSync(tarCmd, { stdio: 'inherit', cwd: projectRoot });

  const stats = fs.statSync(archivePath);
  console.log(`[antideploy] Archive created (${(stats.size / 1024 / 1024).toFixed(2)} MB).`);
  return archivePath;
}

// 6. Deploy archive
async function uploadArchive(token, applicationId, archivePath) {
  console.log('[antideploy] Uploading project archive to Antideploy...');
  const fileBlob = await fs.openAsBlob(archivePath);
  const form = new FormData();
  form.append('archive', fileBlob, 'archive.tar.gz');

  const res = await fetch(`${API_BASE}/deploy?applicationId=${applicationId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const data = await res.json();
  if (res.status === 200 && data.status === 'unchanged') {
    console.log('[antideploy] Deployment is unchanged from last push.');
    return null;
  }
  if (res.status !== 202) {
    throw new Error(`Deploy failed to queue (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log(`[antideploy] Deployment queued. Task ID: ${data.taskId}`);
  return data.taskId;
}

// 7. Poll deployment
async function pollDeployment(token, taskId) {
  console.log(`[antideploy] Watching deployment progress...`);
  let lastStatus = '';
  let lastStep = '';

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const res = await fetch(`${API_BASE}/deployments/${taskId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.warn(`[antideploy] Polling response: ${res.status}`);
      continue;
    }

    const data = await res.json();
    const status = data.status;
    const step = data.currentStep || data.failedStep || '';

    if (status !== lastStatus || step !== lastStep) {
      console.log(`[antideploy] Status: ${status}${step ? ` | Step: ${step}` : ''}`);
      lastStatus = status;
      lastStep = step;
    }

    if (status === 'succeeded') {
      console.log('\n----------------------------------------');
      console.log('🎉 Deployment SUCCEEDED!');
      console.log(`Live URL: ${data.url || 'https://safr-goa.antideploy.com'}`);
      if (data.dashboard) {
        console.log(`Dashboard: ${data.dashboard}`);
      }
      console.log('----------------------------------------\n');
      return data;
    }

    if (status === 'failed') {
      console.error('\n----------------------------------------');
      console.error('❌ Deployment FAILED');
      console.error(`Error: ${data.error || 'Unknown error'}`);
      if (data.failedStep) console.error(`Failed at step: ${data.failedStep}`);
      if (data.deployment?.buildLog) {
        console.error('\n--- Build Log ---');
        console.error(data.deployment.buildLog);
      }
      if (data.deployment?.runtimeLog) {
        console.error('\n--- Runtime Log ---');
        console.error(data.deployment.runtimeLog);
      }
      console.error('----------------------------------------\n');
      throw new Error(`Deployment ${taskId} failed: ${data.error}`);
    }
  }
}

async function main() {
  let archivePath = null;
  try {
    const token = getToken();
    const app = await getOrCreateApplication(token, 'safr-goa', 'safr-goa');
    await syncSecrets(token, app.applicationId);
    archivePath = createArchive();
    const taskId = await uploadArchive(token, app.applicationId, archivePath);
    if (taskId) {
      await pollDeployment(token, taskId);
    }
  } catch (err) {
    console.error(`[antideploy] Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (archivePath && fs.existsSync(archivePath)) {
      try {
        fs.unlinkSync(archivePath);
      } catch {}
    }
  }
}

main();
