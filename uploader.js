import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import Arweave from "arweave";
import {
  Connection,
  PublicKey,
  Keypair,
  Account,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  Token,
  TOKEN_PROGRAM_ID,
  MintLayout,
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { programs } from '@metaplex/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const initOptions = {
  host: "arweave.net", // Hostname or IP address for a Arweave host
  port: 443, // Port
  protocol: "https", // Network protocol http or https
  timeout: 20000, // Network request timeouts in milliseconds
  logging: false, // Enable network request logging
};

const arweave = Arweave.init(initOptions);

const runUpload = async (data, contentType, isUploadByChunk = false) => {
  const key_path = path.resolve(__dirname, "arweave-wallet.json");
  const key = JSON.parse(fs.readFileSync(key_path).toString());
  let address = await arweave.wallets.jwkToAddress(key);
  console.log("Wallet Balance:", await arweave.wallets.getBalance(address));
  const tx = await arweave.createTransaction({ data: data }, key);

  tx.addTag(...contentType);

  await arweave.transactions.sign(tx, key);

  if (isUploadByChunk) {
    const uploader = await arweave.transactions.getUploader(tx);

    while (!uploader.isComplete) {
      await uploader.uploadChunk();
      console.log(
        `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
      );
    }
  }
  await arweave.transactions.post(tx);
  return tx;
};

async function create_single_nft(env, json_data) {
  let connection = new Connection(clusterApiUrl(env), "confirmed");
  const key_path = path.resolve(__dirname, "solana-wallet.json");
  const key_string = fs.readFileSync(key_path, {encoding: 'utf8'});
  const key = Uint8Array.from(JSON.parse(key_string));
  let payer = Keypair.fromSecretKey(key);
  var tx = new Transaction();

  const nft_mint = Keypair.generate();
  const nft_account = (
    await PublicKey.findProgramAddress(
      [
        payer.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        nft_mint.publicKey.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
  )[0];
  const nft_metadata = await programs.metadata.Metadata.getPDA(nft_mint.publicKey);
  const edition = await programs.metadata.MasterEdition.getPDA(nft_mint.publicKey);
  const metadataData = new programs.metadata.MetadataDataData({
    symbol: json_data["text"]["symbol"],
    name: json_data["text"]["name"],
    uri: json_data["json_url"],
    sellerFeeBasisPoints: json_data["text"]["seller_fee_basis_points"],
    creators: [
      new programs.metadata.Creator({
        address: payer.publicKey.toBase58(),
        verified: false,
        share: 100,
      }),
    ],
  });

  const createMintIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: nft_mint.publicKey,
    space: MintLayout.span,
    lamports: await Token.getMinBalanceRentForExemptMint(connection),
    programId: TOKEN_PROGRAM_ID,
  });
  const initMintIx = Token.createInitMintInstruction(
    TOKEN_PROGRAM_ID,
    nft_mint.publicKey,
    0,
    payer.publicKey,
    payer.publicKey
  );
  const createAssocicatedTokenAccountIx = new programs.CreateAssociatedTokenAccount(
    { feePayer: payer.publicKey },
    {
      associatedTokenAddress: nft_account,
      splTokenMintAddress: nft_mint.publicKey,
    }
  );
  const createMetadataIx = new programs.metadata.CreateMetadata(
    { feePayer: payer.publicKey },
    {
      metadata: nft_metadata,
      metadataData: metadataData,
      updateAuthority: payer.publicKey,
      mint: nft_mint.publicKey,
      mintAuthority: payer.publicKey,
    }
  );
  const mintToIx = Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    nft_mint.publicKey,
    nft_account,
    payer.publicKey,
    [],
    1
  );
  const createMasterEditionIx = new programs.metadata.CreateMasterEdition(
    { feePayer: payer.publicKey},
    {
      edition: edition,
      metadata: nft_metadata,
      updateAuthority: payer.publicKey,
      mint: nft_mint.publicKey,
      mintAuthority: payer.publicKey,
      maxSupply: undefined,
    }
  );
  const signMetadataIx = new programs.metadata.SignMetadata(
    { feePayer: payer.publicKey },
    {
      metadata: nft_metadata,
      creator: payer.publicKey,
    }
  );
  tx.add(
    createMintIx,
    initMintIx,
    createAssocicatedTokenAccountIx,
    createMetadataIx,
    mintToIx,
    createMasterEditionIx,
    signMetadataIx,
  );

  var signature;
  signature = await connection.sendTransaction(
    tx,
    [payer, nft_mint],
    { skipPreflight: false, preflightCommitment: "confirmed"}
  );
  await connection.confirmTransaction(signature, "confirmed");

  return nft_mint.publicKey.toBase58();
}
async function update_metadata(env, json_data) {
  let connection = new Connection(clusterApiUrl(env), "confirmed");
  const key_path = path.resolve(__dirname, "solana-wallet.json");
  const key_string = fs.readFileSync(key_path, {encoding: 'utf8'});
  const key = Uint8Array.from(JSON.parse(key_string));
  let payer = Keypair.fromSecretKey(key);
  var tx = new Transaction();

  const nft_mint_pubkey = new PublicKey(json_data["mint_pubkey"]);
  const nft_metadata = await programs.metadata.Metadata.getPDA(nft_mint_pubkey);
  let metadata = await programs.metadata.Metadata.load(connection, nft_metadata);    
  await new Promise((r) => setTimeout(r, 110));

  let newMetadataData = metadata.data.data;
  newMetadataData.uri = json_data["json_url"];
      
  const updateMetadataIx = new programs.metadata.UpdateMetadata(
    { feePayer: payer.publicKey },
    {
      metadata: nft_metadata,
      metadataData: newMetadataData,
      updateAuthority: payer.publicKey,
    }
  );
  tx.add(
    updateMetadataIx,
  );
  let signature = await connection.sendTransaction(
    tx,
    [payer],
    { skipPreflight: false, preflightCommitment: "confirmed"}
  );
  await connection.confirmTransaction(signature, "confirmed");
}

async function upload_image(image_path) {
  const data = fs.readFileSync(image_path);
  if (!data) {
    throw new Error(`Can't find file: ${image_path}`);
  }
  const contentType = ["Content-Type", "image/png"];
  const { id } = await runUpload(data, contentType, true);
  if (id) {
    return `https://arweave.net/${id}?ext=png`;
  } else {
    throw new Error("failed to upload image");
  }
}

async function upload_json(json_data) {
  const contentType = ["Content-Type", "application/json"];
  const metadataString = JSON.stringify(json_data);
  const { id } = await runUpload(metadataString, contentType);
  if (id) {
    return `https://arweave.net/${id}`; 
  } else {
    throw new Error("failed to upload json");
  }
}

function select_env(env) {
  if (env == "mainnet-beta") {
    return "mainnet-beta";
  } else {
    return "devnet";
  }
}

const run = async (env_arg) => {
  let env = select_env(env_arg);
  const key_path = path.resolve(__dirname, "solana-wallet.json");
  const key_string = fs.readFileSync(key_path, {encoding: 'utf8'});
  const key = Uint8Array.from(JSON.parse(key_string));
  let payer = Keypair.fromSecretKey(key);

  let uploads_data = fs.readFileSync(path.resolve(__dirname, "public", env, "uploads.json"));
  let uploads = JSON.parse(uploads_data);
  let pool_data = fs.readFileSync(path.resolve(__dirname, "public", env, "pool.json"));
  let pool = JSON.parse(pool_data);

  let left_uploads = {};
  for (let [image_name, upload_data] of Object.entries(uploads)) {
    if (upload_data["json_upload_required"] == 1) {
      const uploads_image_path = path.resolve(__dirname, "public", env, "image_uploads", image_name);
      const pool_image_path = path.resolve(__dirname, "public", env, "image_pool", image_name);
      if (fs.existsSync(uploads_image_path)) {
        // try upload image
        console.log("Try upload image...");
        try {
          let image_url = await upload_image(uploads_image_path);
          upload_data["text"]["image"] = image_url;
          upload_data["text"]["properties"]["files"] = [];
          upload_data["text"]["properties"]["files"].push({"uri":image_url,"type":"image/png"});
          const image_data = fs.readFileSync(uploads_image_path);
          fs.writeFileSync(pool_image_path, image_data);
          fs.unlinkSync(uploads_image_path);
        } catch (e) {
          console.warn("Image upload error. Leave this entry and continue...", e);
          left_uploads[image_name] = upload_data;
          continue;
        }
      }
      try {
        upload_data["text"]["properties"]["creators"] = [{"address":payer.publicKey.toBase58(),"share":100}]
        let json_url = await upload_json(upload_data["text"]);
        upload_data["json_url"] = json_url;
        upload_data["json_upload_required"] = 0;
      } catch (e) {
        console.warn("Json upload error. Leave this entry and continue...");
        left_uploads[image_name] = upload_data;
        continue;
      }
    }
    try {
      if ("mint_pubkey" in upload_data) {
        // update metadata
        await update_metadata(env, upload_data);
      } else {
        // create nft
        let mint_pubkey = await create_single_nft(env, upload_data);
        // 
        upload_data["mint_pubkey"] = mint_pubkey;
      }
      pool[image_name] = upload_data;
    } catch (e) {
      console.log(e);
      console.warn("Metadata error. Leave this entry and continue...");
      left_uploads[image_name] = upload_data;
      continue;
    }
  }

  const uploads_out = JSON.stringify(left_uploads);
  fs.writeFileSync(path.resolve(__dirname, "public", env, "uploads.json"), uploads_out);
  const pool_out = JSON.stringify(pool);
  fs.writeFileSync(path.resolve(__dirname, "public", env, "pool.json"), pool_out);
}

run(process.argv[2]);
