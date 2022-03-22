import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function select_env(env) {
  if (env == "mainnet-beta") {
    return "mainnet-beta";
  } else {
    return "devnet";
  }
}

const run = async (env_arg) => {
  let env = select_env(env_arg);

  let imports_data = fs.readFileSync(path.resolve(__dirname, "public", env, "imports.json"));
  let imports = JSON.parse(imports_data);
  let uploads_data = fs.readFileSync(path.resolve(__dirname, "public", env, "uploads.json"));
  let uploads = JSON.parse(uploads_data);
  let pool_data = fs.readFileSync(path.resolve(__dirname, "public", env, "pool.json"));
  let pool = JSON.parse(pool_data);

  let left_imports = {};
  for (let [image_name, import_data] of Object.entries(imports)) {
    const imports_image_path = path.resolve(__dirname, "public", env, "image_imports", image_name);
    const uploads_image_path = path.resolve(__dirname, "public", env, "image_uploads", image_name);
    const pool_image_path = path.resolve(__dirname, "public", env, "image_pool", image_name);

    if (!fs.existsSync(imports_image_path)) {
      // error case
      console.warn(`Image for import (${image_name}) does not exists. Leave this entry and continue...`);
      left_imports[image_name] = import_data;
      continue;
    }
    if (fs.existsSync(uploads_image_path)) {
      // error case
      console.warn(`Image with same name (${image_name}) already exists on the image uploads. Leave this entry and continue...`);
      left_imports[image_name] = import_data;
      continue;
    }
    if (fs.existsSync(pool_image_path)) {
      // error case
      console.warn(`Image with same name (${image_name}) already exists on the image pool. Leave this entry and continue...`);
      left_imports[image_name] = import_data;
      continue;
    }

    const image_data = fs.readFileSync(imports_image_path);
    if (!image_data) {
      // error case
      console.warn(`Can't find file: ${image_name}`);
      left_imports[image_name] = import_data;
      continue;
    }
    fs.writeFileSync(uploads_image_path, image_data);
    fs.unlinkSync(imports_image_path);
    uploads[image_name] = { "json_upload_required": 1, "text": import_data };
  }
  const imports_out = JSON.stringify(left_imports);
  fs.writeFileSync(path.resolve(__dirname, "public", env, "imports.json"), imports_out);
  const uploads_out = JSON.stringify(uploads);
  fs.writeFileSync(path.resolve(__dirname, "public", env, "uploads.json"), uploads_out);
}

run(process.argv[2]);
