const { createClient } = require("@supabase/supabase-js");

const url = "https://nxhccqbvjrxqqfvpfcmx.supabase.co";
const anonKey = "sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ";

const supabase = createClient(url, anonKey);

async function run() {
  const { data, error } = await supabase
    .from("stops")
    .select("id, name, route_id, sequence_no, stop_type");
  if (error) {
    console.error("Error querying stops:", error);
  } else {
    console.log("All visible stops:", data);
  }
}

run();
