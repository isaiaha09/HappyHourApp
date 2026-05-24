const os = require('node:os');
const { spawn } = require('node:child_process');

const LOOPBACK_HOST = '127.0.0.1';
const DJANGO_HEALTH_URL = `http://${LOOPBACK_HOST}:8000/api/health/`;
const HEALTH_TIMEOUT_MS = 3000;

delete process.env.CI;

main();

async function main() {
  const lanIp = getLanIpAddress();
  const localHealthy = await isBackendHealthy(DJANGO_HEALTH_URL);

  if (!localHealthy) {
    console.error(`Django backend is not reachable at ${DJANGO_HEALTH_URL}`);
    console.error('Start the backend first, then run npm start again.');
    process.exit(1);
  }

  if (!lanIp) {
    console.error('Could not detect a LAN IPv4 address for Expo Go.');
    console.error('Connect this computer to Wi-Fi or Ethernet, then run npm start again.');
    process.exit(1);
  }

  const lanHealthUrl = `http://${lanIp}:8000/api/health/`;
  const lanHealthy = await isBackendHealthy(lanHealthUrl);

  if (!lanHealthy) {
    console.error(`Django backend is reachable locally but not from the LAN address ${lanHealthUrl}`);
    console.error('Start Django with: python manage.py runserver 0.0.0.0:8000');
    process.exit(1);
  }

  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
  process.env.EXPO_PUBLIC_API_BASE_URL = `http://${lanIp}:8000/api`;

  console.log(`Using LAN IP ${lanIp} for Expo Go and backend API traffic.`);

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['expo', 'start', '--lan', ...process.argv.slice(2)];

  const child = spawn(command, args, {
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
}

async function isBackendHealthy(healthUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return payload?.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getLanIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (address.family !== 'IPv4' || address.internal) {
        continue;
      }

      if (isPrivateIpv4(address.address)) {
        return address.address;
      }
    }
  }

  return null;
}

function isPrivateIpv4(address) {
  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}