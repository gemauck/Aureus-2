-- Simple SQL script to add bulk leads to the database
-- Run via SSH: psql -d your_database -f add-leads-simple.sql
-- Or copy and paste into psql prompt

-- Insert leads (skips duplicates based on name and type)
-- The script will automatically generate IDs and set appropriate defaults

INSERT INTO "Client" (
    id,
    name,
    type,
    industry,
    status,
    stage,
    revenue,
    value,
    probability,
    "lastContact",
    address,
    website,
    notes,
    contacts,
    "followUps",
    "projectIds",
    comments,
    sites,
    contracts,
    "activityLog",
    "billingTerms",
    proposals,
    services,
    thumbnail,
    "createdAt",
    "updatedAt"
)
SELECT 
    'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 24) as id,
    company_name as name,
    'lead' as type,
    CASE
        WHEN LOWER(company_name) LIKE '%mining%' OR LOWER(company_name) LIKE '%coal%' OR 
             LOWER(company_name) LIKE '%diamond%' OR LOWER(company_name) LIKE '%platinum%' OR
             LOWER(company_name) LIKE '%manganese%' OR LOWER(company_name) LIKE '%uranium%' OR
             LOWER(company_name) LIKE '%nickel%' OR LOWER(company_name) LIKE '%chrome%' OR
             LOWER(company_name) LIKE '%antracite%' OR LOWER(company_name) LIKE '%minerals%' OR
             LOWER(company_name) LIKE '%gold%' OR LOWER(company_name) LIKE '%zinc%' OR
             LOWER(company_name) LIKE '%copper%' OR LOWER(company_name) LIKE '%palladium%' THEN 'Mining'
        WHEN LOWER(company_name) LIKE '%forestry%' OR LOWER(company_name) LIKE '%farm%' THEN 'Agriculture'
        WHEN LOWER(company_name) LIKE '%fuel%' OR LOWER(company_name) LIKE '%energy%' OR 
             LOWER(company_name) LIKE '%energies%' OR LOWER(company_name) LIKE '%engen%' THEN 'Energy'
        WHEN LOWER(company_name) LIKE '%logistics%' OR LOWER(company_name) LIKE '%transit%' OR 
             LOWER(company_name) LIKE '%transport%' OR LOWER(company_name) LIKE '%transnet%' THEN 'Logistics'
        WHEN LOWER(company_name) LIKE '%contractor%' OR LOWER(company_name) LIKE '%service%' OR
             LOWER(company_name) LIKE '%group%' THEN 'Services'
        ELSE 'Other'
    END as industry,
    'active' as status,
    'Awareness' as stage,
    0 as revenue,
    0 as value,
    0 as probability,
    NOW() as "lastContact",
    '' as address,
    '' as website,
    'Lead added via bulk import on ' || CURRENT_DATE::TEXT as notes,
    '[]' as contacts,
    '[]' as "followUps",
    '[]' as "projectIds",
    '[]' as comments,
    '[]' as sites,
    '[]' as contracts,
    ('[{"id":' || EXTRACT(EPOCH FROM NOW())::BIGINT || ',"type":"Lead Created","description":"Lead created via bulk import","timestamp":"' || NOW()::TEXT || '","user":"System","userId":"system","userEmail":"system@abcotronics.co.za"}]')::TEXT as "activityLog",
    '{"paymentTerms":"Net 30","billingFrequency":"Monthly","currency":"ZAR","retainerAmount":0,"taxExempt":false,"notes":""}' as "billingTerms",
    '[]' as proposals,
    '[]' as services,
    '' as thumbnail,
    NOW() as "createdAt",
    NOW() as "updatedAt"
FROM (
    VALUES
        ('Coastal Coal'),
        ('Petra Diamonds'),
        ('Anglo American'),
        ('Implats'),
        ('Liberty'),
        ('De Beers'),
        ('Sibanye Stilwater'),
        ('Pan African Resources'),
        ('Africa In Transit AIT'),
        ('Glencore'),
        ('Implats MIC'),
        ('Assmang and Assore'),
        ('African Rainbow Minerals and Royal Bafokeng'),
        ('Foscor'),
        ('Khumba and Khumani'),
        ('Shumba Energy (Botswana)'),
        ('Northam Platinum/Palladium Group Metals'),
        ('Richards Bay Minerals'),
        ('Afrimat'),
        ('Northam Platinum'),
        ('Siyanda Bakgatla Platinum Mine (Pty) Ltd (Union Mine)'),
        ('Rio Tinto'),
        ('South 32'),
        ('Sasol Mining'),
        ('Harmony Gold'),
        ('Palaborwa Mining Company'),
        ('Ndalamo Group'),
        ('Zivuma Commodities and Mining'),
        ('T and K Group Emalahleni'),
        ('Copper 360'),
        ('Cometa Group'),
        ('Into Africa Mining and Exploration'),
        ('Plantcor Mining'),
        ('Mosobo Coal'),
        ('Future Coal'),
        ('Lebano Mining'),
        ('Benhaus Mining'),
        ('BBT'),
        ('Zamera Logistics (PTY) Ltd'),
        ('Transnet'),
        ('Total Energies'),
        ('Engen'),
        ('Petredec Fuels KZN'),
        ('Khuthele Forestry'),
        ('Emseni Farms'),
        ('Sun City'),
        ('Sappi'),
        ('Energy Drive'),
        ('Smart Vision'),
        ('Ava'),
        ('Rocket DNA'),
        ('Middleburg Mining Services - Sereti'),
        ('Vedanta Zinc'),
        ('United Manganese Of Kalahari'),
        ('Assmang Khumani'),
        ('Anglo Mogalakwena'),
        ('Namdeb'),
        ('Rosh Pina Namibia'),
        ('Tshipi e Ntele Manganese'),
        ('Umsimbithi'),
        ('Andru Mining'),
        ('Inayo Mining'),
        ('AEMFC'),
        ('B and E International'),
        ('Buffalo Coal'),
        ('ALS Contractors'),
        ('Sefateng Chrome - Aubrey Uoane - CFO'),
        ('Michael Mathabatha - Mining Manager'),
        ('Gerard Blaauw - CEO'),
        ('Salaria Contractors'),
        ('Trollope Group'),
        ('Zizwe Opencast Mining'),
        ('Moolmans'),
        ('Inala Mining - Inmine'),
        ('Ritluka'),
        ('Africoal SA'),
        ('Menar Mining including Canyon Coal'),
        ('Zululand Antracite'),
        ('MC Mining'),
        ('Cobus Bronn'),
        ('Orion Minerals'),
        ('Deep Yellow Uranium'),
        ('African Nickel'),
        ('MN48'),
        ('Terracom'),
        ('Modi Mining'),
        ('Afrisam'),
        ('Lubocon')
) AS companies(company_name)
WHERE NOT EXISTS (
    SELECT 1 
    FROM "Client" 
    WHERE LOWER("Client".name) = LOWER(companies.company_name) 
    AND "Client".type = 'lead'
);

-- Show summary
SELECT 
    COUNT(*) as total_leads,
    COUNT(DISTINCT industry) as industries_represented,
    string_agg(DISTINCT industry, ', ' ORDER BY industry) as industries
FROM "Client"
WHERE type = 'lead';

-- Show recently added leads (last 10)
SELECT 
    name,
    industry,
    status,
    stage,
    "createdAt"
FROM "Client"
WHERE type = 'lead'
ORDER BY "createdAt" DESC
LIMIT 10;

