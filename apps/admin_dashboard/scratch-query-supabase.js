const { createClient } = require("@supabase/supabase-js");

const url = "https://nxhccqbvjrxqqfvpfcmx.supabase.co";
const anonKey = "sb_publishable_o8dPRVLYMRr2TgUDH75cBA_J_BpuODZ";

const supabase = createClient(url, anonKey);

async function run() {
  console.log("Querying columns including 'status'...");
  const { data, error } = await supabase
    .from("students")
    .select("id, name, route_id, status");

  if (error) {
    console.error("Query failed:", error);
  } else {
    console.log("Query succeeded! Result:", data);
  }
}

run();
