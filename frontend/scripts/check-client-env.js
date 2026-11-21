const fs = require("fs");
const path = require("path");

const clientEnvFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];
const sensitiveName = /(API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i;
const exposedNames = new Set();

for (const name of Object.keys(process.env)) {
  if (name.startsWith("REACT_APP_") && sensitiveName.test(name)) {
    exposedNames.add(name);
  }
}

for (const file of clientEnvFiles) {
  const filePath = path.join(__dirname, "..", file);
  if (!fs.existsSync(filePath)) continue;

  const contents = fs.readFileSync(filePath, "utf8");
  for (const match of contents.matchAll(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=/gm)) {
    const name = match[1];
    if (name.startsWith("REACT_APP_") && sensitiveName.test(name)) {
      exposedNames.add(name);
    }
  }
}

if (exposedNames.size > 0) {
  console.error(
    `Refusing frontend start/build: move secret-like client variables to the backend: ${[...exposedNames].join(", ")}`
  );
  process.exit(1);
}
