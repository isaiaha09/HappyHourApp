const os = require('node:os');
const { spawn } = require('node:child_process');

const LOOPBACK_HOST = '127.0.0.1';
const DJANGO_HEALTH_URL = `http://${LOOPBACK_HOST}:8000/api/health/`;
const HEALTH_TIMEOUT_MS = 3000;

delete process.env.CI;

main();

async function main() {
  const cli = parseCliOptions(process.argv.slice(2));
  const lanIp = cli.hostIp || getLanIpAddress(cli.adapter);
  const localHealthy = await isBackendHealthy(DJANGO_HEALTH_URL);

  if (!localHealthy) {
    console.error(`Django backend is not reachable at ${DJANGO_HEALTH_URL}`);
    console.error('Start the backend first, then run npm start again.');
    process.exit(1);
  }

  if (!lanIp) {
    console.error(`Could not detect a LAN IPv4 address${cli.adapter === 'any' ? '' : ` for ${cli.adapter}`}.`);
    console.error('Connect this computer to Wi-Fi or Ethernet, then run npm start again.');
    console.error('Try one of these commands: npm run start:wifi, npm run start:ethernet');
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

  console.log(`Using LAN IP ${lanIp} (${cli.adapter}) for Expo Go and backend API traffic.`);

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['expo', 'start', `--${cli.networkMode}`, ...cli.expoArgs];

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

function parseCliOptions(rawArgs) {
  const options = {
    adapter: 'any',
    hostIp: process.env.MOBILE_HOST_IP || null,
    expoArgs: [],
    developmentBuild: false,
    networkMode: 'lan',
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === '--wifi') {
      options.adapter = 'wifi';
      continue;
    }

    if (arg === '--ethernet' || arg === '--lan-cable') {
      options.adapter = 'ethernet';
      continue;
    }

    if (arg.startsWith('--adapter=')) {
      const value = arg.split('=')[1] || '';
      options.adapter = normalizeAdapter(value);
      continue;
    }

    if (arg === '--tunnel' || arg === 'tunnel') {
      options.networkMode = 'tunnel';
      continue;
    }

    if (arg === '--dev-client' || arg === '--development-build' || arg === 'dev-client') {
      options.developmentBuild = true;
      continue;
    }

    if (arg === '--lan' || arg === 'lan') {
      options.networkMode = 'lan';
      continue;
    }

    if (arg === '--localhost' || arg === 'localhost') {
      options.networkMode = 'localhost';
      continue;
    }

    if (arg === '--adapter') {
      const value = rawArgs[index + 1];

      if (value) {
        options.adapter = normalizeAdapter(value);
        index += 1;
      }

      continue;
    }

    if (arg.startsWith('--host-ip=')) {
      const value = arg.split('=')[1];

      if (value) {
        options.hostIp = value;
      }

      continue;
    }

    if (arg === '--host-ip') {
      const value = rawArgs[index + 1];

      if (value) {
        options.hostIp = value;
        index += 1;
      }

      continue;
    }

    options.expoArgs.push(arg);
  }

  if (options.developmentBuild && !options.expoArgs.includes('--dev-client')) {
    options.expoArgs.unshift('--dev-client');
  }

  return options;
}

function normalizeAdapter(raw) {
  const value = String(raw || '').trim().toLowerCase();

  if (value === 'wifi' || value === 'wlan' || value === 'wi-fi') {
    return 'wifi';
  }

  if (value === 'ethernet' || value === 'wired' || value === 'lan') {
    return 'ethernet';
  }

  return 'any';
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

function getLanIpAddress(adapterPreference) {
  const preferredInterface = findMatchingInterface(adapterPreference);

  if (preferredInterface) {
    const ip = extractPrivateIpv4(preferredInterface.addresses);

    if (ip) {
      return ip;
    }
  }

  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    const ip = extractPrivateIpv4(addresses);

    if (ip) {
      return ip;
    }
  }

  return null;
}

function findMatchingInterface(adapterPreference) {
  if (adapterPreference === 'any') {
    return null;
  }

  const interfaces = os.networkInterfaces();
  const names = Object.keys(interfaces);

  for (const name of names) {
    const lowered = name.toLowerCase();
    const matchesWifi = /wi-?fi|wlan|wireless/.test(lowered);
    const matchesEthernet = /ethernet|eth|en\d/.test(lowered);

    if (adapterPreference === 'wifi' && matchesWifi) {
      return { name, addresses: interfaces[name] };
    }

    if (adapterPreference === 'ethernet' && matchesEthernet) {
      return { name, addresses: interfaces[name] };
    }
  }

  return null;
}

function extractPrivateIpv4(addresses) {
  if (!addresses) {
    return null;
  }

  for (const address of addresses) {
    if (address.family !== 'IPv4' || address.internal) {
      continue;
    }

    if (isPrivateIpv4(address.address)) {
      return address.address;
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