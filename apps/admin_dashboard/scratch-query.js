const { createClient } = require("@supabase/supabase-js");

const url = "https://nxhccqbvjrxqqfvpfcmx.supabase.co";
const anonKey = "sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ";

const supabase = createClient(url, anonKey);

async function run() {
  const { data, error } = await supabase
    .from("routes")
    .select("id, name");
  if (error) {
    console.error("Error querying routes:", error);
  } else {
    console.log("All visible routes:", JSON.stringify(data, null, 2));
  }
}

run();
