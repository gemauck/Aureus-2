-- SQL script to add bulk leads to the database
-- Run this via SSH: psql -d your_database < add-leads.sql
-- Or copy and paste into psql prompt

-- Function to generate a CUID-like ID (25 characters, starting with 'c')
CREATE OR REPLACE FUNCTION generate_cuid() RETURNS TEXT AS $$
DECLARE
    chars TEXT := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    result TEXT := 'c';
    i INTEGER;
BEGIN
    FOR i IN 1..24 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Helper function to determine industry based on company name
CREATE OR REPLACE FUNCTION get_industry(name TEXT) RETURNS TEXT AS $$
BEGIN
    CASE
        WHEN LOWER(name) LIKE '%mining%' OR LOWER(name) LIKE '%coal%' OR 
             LOWER(name) LIKE '%diamond%' OR LOWER(name) LIKE '%platinum%' OR
             LOWER(name) LIKE '%manganese%' OR LOWER(name) LIKE '%uranium%' OR
             LOWER(name) LIKE '%nickel%' OR LOWER(name) LIKE '%chrome%' OR
             LOWER(name) LIKE '%antracite%' OR LOWER(name) LIKE '%minerals%' OR
             LOWER(name) LIKE '%gold%' OR LOWER(name) LIKE '%zinc%' OR
             LOWER(name) LIKE '%copper%' OR LOWER(name) LIKE '%palladium%' THEN
            RETURN 'Mining';
        WHEN LOWER(name) LIKE '%forestry%' OR LOWER(name) LIKE '%farm%' THEN
            RETURN 'Agriculture';
        WHEN LOWER(name) LIKE '%fuel%' OR LOWER(name) LIKE '%energy%' OR 
             LOWER(name) LIKE '%energies%' OR LOWER(name) LIKE '%engen%' THEN
            RETURN 'Energy';
        WHEN LOWER(name) LIKE '%logistics%' OR LOWER(name) LIKE '%transit%' OR 
             LOWER(name) LIKE '%transport%' OR LOWER(name) LIKE '%transnet%' THEN
            RETURN 'Logistics';
        WHEN LOWER(name) LIKE '%contractor%' OR LOWER(name) LIKE '%service%' OR
             LOWER(name) LIKE '%group%' THEN
            RETURN 'Services';
        ELSE
            RETURN 'Other';
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Default billing terms JSON
DO $$
DECLARE
    default_billing_terms TEXT := '{"paymentTerms":"Net 30","billingFrequency":"Monthly","currency":"ZAR","retainerAmount":0,"taxExempt":false,"notes":""}';
    default_activity_log TEXT := '[{"id":' || EXTRACT(EPOCH FROM NOW())::BIGINT || ',"type":"Lead Created","description":"Lead created via bulk import","timestamp":"' || NOW()::TEXT || '","user":"System","userId":"system","userEmail":"system@abcotronics.co.za"}]';
    company_name TEXT;
    lead_id TEXT;
    industry TEXT;
    notes_text TEXT;
BEGIN
    -- Insert leads one by one, skipping duplicates
    FOR company_name IN VALUES
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
    LOOP
        -- Check if lead already exists
        IF NOT EXISTS (SELECT 1 FROM "Client" WHERE LOWER(name) = LOWER(company_name) AND type = 'lead') THEN
            -- Generate ID and determine industry
            lead_id := generate_cuid();
            industry := get_industry(company_name);
            notes_text := 'Lead added via bulk import on ' || CURRENT_DATE::TEXT;
            
            -- Insert the lead
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
            ) VALUES (
                lead_id,
                company_name,
                'lead',
                industry,
                'active',
                'Awareness',
                0,
                0,
                0,
                NOW(),
                '',
                '',
                notes_text,
                '[]',
                '[]',
                '[]',
                '[]',
                '[]',
                '[]',
                default_activity_log,
                default_billing_terms,
                '[]',
                '[]',
                '',
                NOW(),
                NOW()
            );
            
            RAISE NOTICE '✅ Created lead: % (%)', company_name, industry;
        ELSE
            RAISE NOTICE '⏭️  Skipped (already exists): %', company_name;
        END IF;
    END LOOP;
END $$;

-- Clean up helper functions
DROP FUNCTION IF EXISTS generate_cuid();
DROP FUNCTION IF EXISTS get_industry(TEXT);

-- Show summary
SELECT 
    COUNT(*) as total_leads,
    COUNT(DISTINCT industry) as industries_represented,
    string_agg(DISTINCT industry, ', ' ORDER BY industry) as industries
FROM "Client"
WHERE type = 'lead';

-- Show recently added leads
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

-- Completion message
\echo '✅ Bulk lead addition completed!'

