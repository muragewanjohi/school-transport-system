const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "../../supabase/migrations");
const outputFile = path.join(__dirname, "../../supabase_schema_bundle.sql");

function bundle() {
  console.log("Reading migrations from:", migrationsDir);
  
  if (!fs.existsSync(migrationsDir)) {
    console.error("Migrations directory not found!");
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith(".sql"))
    .sort(); // Sort chronologically by timestamp prefix

  console.log(`Found ${files.length} migration files.`);

  let bundledSql = `-- ========================================================\n`;
  bundledSql += `-- BUNDLED DATABASE MIGRATIONS FOR SAFARICOM TRACK\n`;
  bundledSql += `-- Generated: ${new Date().toISOString()}\n`;
  bundledSql += `-- ========================================================\n\n`;

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Automatically prefix CREATE POLICY with DROP POLICY IF EXISTS
    const policyRegex = /CREATE\s+POLICY\s+("([^"]+)"|([a-zA-Z0-9_\-]+))\s+ON\s+([a-zA-Z0-9_\.]+)/gi;
    const processedContent = content.replace(policyRegex, (match, p1, p2, p3, p4) => {
      const policyName = p1;
      const tableName = p4;
      return `DROP POLICY IF EXISTS ${policyName} ON ${tableName};\n${match}`;
    });

    bundledSql += `-- --------------------------------------------------------\n`;
    bundledSql += `-- MIGRATION: ${file}\n`;
    bundledSql += `-- --------------------------------------------------------\n\n`;
    bundledSql += processedContent;
    bundledSql += "\n\n";
  }

  fs.writeFileSync(outputFile, bundledSql, "utf-8");
  console.log("Successfully bundled migrations into:", outputFile);
}

bundle();
