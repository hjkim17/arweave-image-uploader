import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import csv from "csv-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const results = [];

function select_env(env) {
  if (env == "mainnet-beta") {
    return "mainnet-beta";
  } else {
    return "devnet";
  }
}

const run = async (env) => {
  let uploads_data = fs.readFileSync(path.resolve(__dirname, "public", env, "uploads.json"));
  let uploads = JSON.parse(uploads_data);
  let pool_data = fs.readFileSync(path.resolve(__dirname, "public", env, "pool.json"));
  let pool = JSON.parse(pool_data);
  
  for (const mint_pubkey of results) {
    for (let [image_name, pool_data] of Object.entries(pool)) {
      if (pool_data["mint_pubkey"] == mint_pubkey["Mint"]) {
        uploads[image_name] = pool_data;
        break;
      }
    }
  }

  const uploads_out = JSON.stringify(uploads);
  fs.writeFileSync(path.resolve(__dirname, "public", env, "uploads.json"), uploads_out);
}

const readCsv = async (env_arg) => {
  let env = select_env(env_arg);
  fs.createReadStream(path.resolve(__dirname, "public", env, "load.csv"))
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {
      run(env);
    });
};

readCsv(process.argv[2]);
