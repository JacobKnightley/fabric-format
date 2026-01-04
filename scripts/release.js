#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execSync } = require('node:child_process');

const CORE_PKG = path.join(__dirname, '../packages/core/package.json');
const CHROMIUM_PKG = path.join(__dirname, '../packages/chromium/package.json');
const CHROMIUM_MANIFEST = path.join(
  __dirname,
  '../packages/chromium/manifest.json',
);
const VERSION_FILE = path.join(__dirname, '../VERSION');

function readVersion(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

function writeVersion(pkgPath, version) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return current;
  }
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const coreVersion = readVersion(CORE_PKG);
  const chromiumVersion = readVersion(CHROMIUM_PKG);
  const releaseId = parseInt(fs.readFileSync(VERSION_FILE, 'utf8').trim(), 10);

  console.log('\n📦 fabric-format Release Tool\n');
  console.log(`  Release ID: ${releaseId}`);
  console.log(`  Core:       v${coreVersion}`);
  console.log(`  Chromium:   v${chromiumVersion}\n`);

  // Core can't be released without extension (extension bundles core)
  // But extension can be released alone (UI fixes, etc.)
  const choice = await prompt(
    rl,
    'Release: (1) Chromium only, (2) Both (core + chromium), (q) Quit: ',
  );

  if (choice === 'q' || choice === 'Q') {
    console.log('Cancelled.');
    rl.close();
    return;
  }

  const releaseCore = choice === '2';
  const releaseChromium = choice === '1' || choice === '2';

  if (!releaseChromium) {
    console.log('Invalid choice.');
    rl.close();
    return;
  }

  const bumpType = await prompt(
    rl,
    'Bump type: (1) patch, (2) minor, (3) major: ',
  );
  const type =
    bumpType === '1'
      ? 'patch'
      : bumpType === '2'
        ? 'minor'
        : bumpType === '3'
          ? 'major'
          : null;

  if (!type) {
    console.log('Invalid bump type.');
    rl.close();
    return;
  }

  const tags = [];

  if (releaseCore) {
    const newVersion = bumpVersion(coreVersion, type);
    console.log(`\n  Core: ${coreVersion} → ${newVersion}`);
    writeVersion(CORE_PKG, newVersion);
    tags.push(`core@${newVersion}`);
  }

  if (releaseChromium) {
    const newVersion = bumpVersion(chromiumVersion, type);
    console.log(`  Chromium: ${chromiumVersion} → ${newVersion}`);
    writeVersion(CHROMIUM_PKG, newVersion);
    // Also update manifest.json
    const manifest = JSON.parse(fs.readFileSync(CHROMIUM_MANIFEST, 'utf8'));
    manifest.version = newVersion;
    fs.writeFileSync(
      CHROMIUM_MANIFEST,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    tags.push(`chromium@${newVersion}`);
  }

  // Always bump release ID
  const newReleaseId = releaseId + 1;
  fs.writeFileSync(VERSION_FILE, `${newReleaseId.toString()}\n`);
  console.log(`  Release ID: ${releaseId} → ${newReleaseId}`);

  console.log('\n✅ Version files updated!');

  // Run Biome on modified JSON files to fix formatting (JSON.stringify expands arrays differently)
  console.log('   Running Biome to fix formatting...');
  const filesToFormat = [CHROMIUM_PKG, CHROMIUM_MANIFEST];
  if (releaseCore) filesToFormat.push(CORE_PKG);
  try {
    execSync(`npx biome check --write ${filesToFormat.join(' ')}`, {
      stdio: 'inherit',
    });
  } catch {
    // Biome may exit non-zero if it made changes, that's fine
  }

  console.log(
    `\n   Commit message: release: v${newReleaseId} (${tags.join(', ')})`,
  );
  console.log('\n   Next steps:');
  console.log('   1. Stage and commit your changes');
  console.log('   2. Push and create PR to main');
  console.log('   3. On merge, release workflow runs automatically\n');

  rl.close();
}

main();
