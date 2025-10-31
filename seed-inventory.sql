-- SQL Script to seed inventory with stock items
-- Run this directly in your PostgreSQL database
-- Usage: psql -d your_database -f seed-inventory.sql

-- Ensure UUID extension is available (for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- First, get the current max SKU number to continue from
DO $$
DECLARE
    max_sku_num INTEGER := 0;
    current_sku TEXT;
    sku_match TEXT;
BEGIN
    -- Find the highest existing SKU number
    SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 'SKU(\d+)') AS INTEGER)), 0)
    INTO max_sku_num
    FROM "InventoryItem"
    WHERE sku ~ '^SKU\d+$';
    
    -- If no items exist, start from 0, otherwise the next SKU will be max_sku_num + 1
    RAISE NOTICE 'Starting SKU number: %', max_sku_num + 1;
END $$;

-- Function to determine category based on part number and description
CREATE OR REPLACE FUNCTION determine_inventory_category(part_num TEXT, desc_text TEXT)
RETURNS TEXT AS $$
BEGIN
    part_num := LOWER(COALESCE(part_num, ''));
    desc_text := LOWER(COALESCE(desc_text, ''));
    
    IF part_num LIKE '%fuse%' OR part_num LIKE '%led%' OR part_num LIKE '%diode%' OR
       part_num LIKE '%transistor%' OR part_num LIKE '%capacitor%' OR part_num LIKE '%resistor%' OR
       part_num LIKE '%ic%' OR part_num LIKE '%op amp%' OR part_num LIKE '%regulator%' OR
       part_num LIKE '%sensor%' OR part_num LIKE '%switch%' OR part_num LIKE '%connector%' OR
       part_num LIKE '%header%' OR part_num LIKE '%socket%' OR part_num LIKE '%relay%' OR
       part_num LIKE '%inductor%' OR part_num LIKE '%zener%' OR part_num LIKE '%schottky%' THEN
        RETURN 'components';
    END IF;
    
    IF part_num LIKE '%enclosure%' OR part_num LIKE '%box%' OR part_num LIKE '%housing%' OR
       part_num LIKE '%panel%' OR part_num LIKE '%gland%' OR part_num LIKE '%junction%' THEN
        RETURN 'accessories';
    END IF;
    
    IF part_num LIKE '%battery%' OR part_num LIKE '%power%' OR part_num LIKE '%psu%' THEN
        RETURN 'accessories';
    END IF;
    
    IF part_num LIKE '%screw%' OR part_num LIKE '%nut%' OR part_num LIKE '%washer%' OR
       part_num LIKE '%spacer%' OR part_num LIKE '%tape%' OR part_num LIKE '%pipe%' OR
       part_num LIKE '%joiner%' OR part_num LIKE '%valve%' THEN
        RETURN 'accessories';
    END IF;
    
    IF part_num LIKE '%completed unit%' OR part_num LIKE '%fuel track completed%' THEN
        RETURN 'finished_goods';
    END IF;
    
    RETURN 'components';
END;
$$ LANGUAGE plpgsql;

-- Function to determine type
CREATE OR REPLACE FUNCTION determine_inventory_type(part_num TEXT)
RETURNS TEXT AS $$
BEGIN
    part_num := LOWER(COALESCE(part_num, ''));
    
    IF part_num LIKE '%completed unit%' OR part_num LIKE '%finished%' THEN
        RETURN 'finished_good';
    END IF;
    
    IF part_num LIKE '%housing%' OR part_num LIKE '%card rev%' THEN
        RETURN 'work_in_progress';
    END IF;
    
    RETURN 'raw_material';
END;
$$ LANGUAGE plpgsql;

-- Main insertion script
-- SKU numbers will be auto-generated starting from the next available number
DO $$
DECLARE
    max_sku_num INTEGER;
    next_sku_num INTEGER := 1;
    item_record RECORD;
    unit_cost NUMERIC;
    reorder_point NUMERIC;
    reorder_qty NUMERIC;
    item_status TEXT;
    item_category TEXT;
    item_type TEXT;
    item_name TEXT;
    sku_text TEXT;
    item_id TEXT;
BEGIN
    -- Get max SKU number
    SELECT COALESCE(MAX(CAST(SUBSTRING(sku FROM 'SKU(\d+)') AS INTEGER)), 0)
    INTO max_sku_num
    FROM "InventoryItem"
    WHERE sku ~ '^SKU\d+$';
    
    next_sku_num := max_sku_num + 1;
    
    -- Insert all stock items
    FOR item_record IN 
        SELECT * FROM (VALUES
            ('250mA 5x20mm Fuse', '250mA F Glass Cartridge Fuse 5x20mm', 50, 344.55),
            ('500mA 5x20mm Fuse', '500mA F Glass Cartridge Fuse 5x20mm', 120, 844.56),
            ('1A 5x20mm Fuse', '1A F Glass Cartridge Fuse 5x20mm', 60, 264.60),
            ('1.5A 5x20mm Fuse', '1.5A F Glass Cartridge Fuse 5x20mm', 100, 889.10),
            ('Fuse Holder for 5 x 20mm Fuse, 1P, 250V ac', 'Fuse Holder for 5 x 20mm Fuse, 1P, 250V ac', 10, 575.10),
            ('M4 A2 S/S Nut-Nyloc', 'M4 A2 S/S Nut-Nyloc', 200, 74.00),
            ('M4 A2 spring washer S/S', 'M4 A2 spring washer S/S', 200, 18.00),
            ('M4 A2 S/S NUT', 'M4 A2 S/S NUT', 200, 36.00),
            ('47UF 25V', '27UF 25V LOW Z RADIAL', 60, 16.68),
            ('1734-0704-4P-CL0M-ND', 'REC,4P,BLK,FLANG', 12, 2567.52),
            ('DIODE 1N4148 MELF', '100V 0.45A SW.DIODE SOD80C', 2500, 350.00),
            ('Tact Switch', 'Tact Switch5W-KPT1104', 6, 16.14),
            ('DMP2305U-7', 'DMP2305U-7', 15, 27.15),
            ('Orange M-STEEL enclosure', 'Orange M-STEEL enclosure', 5, 8120.00),
            ('R-1M', 'R-1M', 70, 4.62),
            ('Underground Phone', 'Underground Phone', 4, 17964.00),
            ('Battery Holder Coin Cell', 'Battery Holder Coin Cell', 10, 186.52),
            ('Fuel Track Completed Unit', 'Complete fuel track', 4, 36000.00),
            ('Black 4mm Banana Jack', 'Black 4mm Banana Jack', 0, 0.00),
            ('Red Terminal', 'mm Banana Jack (Blue Terminal - 72M606) (Green Terminal - 72', 6, 1.62),
            ('20mm Top-Knob', '20mm Top-Knob', 12, 18.72),
            ('31mm Top-Knob', 'OKW 20mm Grey Top-Knob', 4, 30.00),
            ('8 Pin DIP IC Socket', '8 Pin DIL Tulip Type IC Socket', 4, 1.32),
            ('9 Volt PP3', '9 Volt PP3 Alkaline Battery', 0, 0.00),
            ('RM8 12 Pin Former', 'RM8 8 or 12 Pin Former 1 x Required', 30, 60.30),
            ('RM8 Cores (2 Req)', 'RM8 Cores (2 Req)', 400, 800.00),
            ('RM8 Ferrite Core (N30)', 'RM8 Ferrite Core (N30) 2 x Required', 8, 74.16),
            ('ICM7555CN', 'CMOS Timer', 5, 81.25),
            ('TLC277CP', 'Op Amp', 8, 0.00),
            ('MCR100-6', 'Switching Regulator', 8, 44.80),
            ('600 Volt SCR', '600 Volt SCR TO-92', 30, 41.10),
            ('BC547B', 'NPN Transistor TO-92', 30, 9.30),
            ('BC557B', 'PNP Transistor TO-92', 100, 39.00),
            ('BS250P', 'P-Channel FET', 10, 111.20),
            ('1N4148', 'Switching Diode Axial', 10, 1.60),
            ('FR105', '600 Volt 1 Amp Fast Recovery Diode Axial', 15, 3.30),
            ('1N5817', '1 Amp 20 Volt Schottky Diode', 6, 1.50),
            ('LM385Z-1.2', 'Precision 1.2 Volt Shunt Regulator TO-92', 6, 27.45),
            ('C-PF-1000uf', '20% 16 Volt Electrolytic Radial Low ESR', 160, 256.00),
            ('C-PF-10uf', '20% 16 Volt Tantalum Tag 5mm PCM', 20, 49.00),
            ('C-PF-2.2uf', '20% 25 Volt Tantalum Tag 5mm PCM', 27, 47.25),
            ('C-PF-1uf', '20% 63 Volt Polyester 5mm PCM', 15, 45.75),
            ('C-PF-470nf', '20% 250/275 Volt AC Polyprop 22mm PCM', 100, 27.00),
            ('C-PF-100nf', '20% 63 Volt Polyester 5mm PCM', 60, 183.00),
            ('C-PF-22nf', '20% 250/275 Volt AC Polyprop 10mm PCM', 20, 5.40),
            ('C-PR-10nf', '20% 63 Volt Polyester 5mm PCM', 40, 26.00),
            ('C-PR-1nf', '20% 63 Volt Polyester 5mm PCM', 114, 152.76),
            ('R-MF-220K', '1% 1/4 Watt Metal Film Resistor', 100, 52.00),
            ('R-MF-180K', '1% 1/4 Watt Metal Film Resistor', 110, 26.40),
            ('R-MF-100K', '1% 1/4 Watt Metal Film Resistor', 100, 52.00),
            ('R-MF-68K', '1% 1/4 Watt Metal Film Resistor', 400, 172.00),
            ('R-MF-47K', '1% 1/4 Watt Metal Film Resistor', 100, 30.00),
            ('R-MF-4K7', '1% 1/4 Watt Metal Film Resistor', 100, 47.00),
            ('Varistor 18V', 'Panasonic, V Surge Absorber 1.6nF 1A, Clamping 40V, Varistor 18V', 20, 108.60),
            ('1.5nF 50V', '1.5nF 50V Capacitor', 3, 70.00),
            ('SD memory card', 'R-0603', 500, 300.00),
            ('R4K8-0603', 'R-0603', 5000, 0.00),
            ('R-1603-1K5', '1K5 +- 1% 1/10W 0603', 4304, 636.56),
            ('Connector Plug 12 Way', 'enol Industrial, AT Automotive Connector Plug 12 Way, Crimp Termi', 10, 705.10),
            ('RM8 12 Pin Former', 'RM8 12 Pin Former', 4, 176.24),
            ('Black Banana Plug', 'Black Male Banana Plug - Solder Termination, 30 V ac, 60V dc, 30A', 4, 99.04),
            ('Red Banana Plug', 'Red Male Banana Plug - Solder Termination, 30 V ac, 60V dc, 30A', 4, 99.20),
            ('Wedgelock', 'DT 12 Way Wedgelock for use with Automotive Connectors', 27, 218.97),
            ('DT Automotive Connector Socket 12 Way', 'DT Flanged receptacle 12 pin', 9, 1724.13),
            ('102102EX', 'EX JUNCTION BOX 25MM GLAND IP68R Zone 1,2,21,22', 0, 0.00),
            ('JUNCTION BOX 25mm IP68 - Black', 'JUNCTION BOX 25mm IP68 - Black', 0, 0.00),
            ('M25 x 1.5 cable gland', 'M25 x 1.5 cable gland', 20, 242.00),
            ('R-2K2 watt axial', 'R-2K2 watt axial', 125, 31.25),
            ('10R 5W Wire wound axial', '10R 5W Wire wound axial', 70, 50.00),
            ('F.HOLD 5x20mm - Fuse box', 'F.HOLD 5x20mm - Fuse box', 40, 234.50),
            ('1R8 +-5% wire wound axial', '1R8 +-5% wire wound axial', 13, 20.54),
            ('1R +-5% 5WW WND', '1R +-5% 5WW WND', 0, 0.00),
            ('R-680R-0603', 'R-0603', 2877, 316.47),
            ('Red-LED-0603', 'LED 0603', 116, 0.00),
            ('Green-LED-0603', 'LED 0603', 180, 178.20),
            ('Blue-LED-0603', 'LED 0603', 127, 142.24),
            ('NCP5501DT33RKG', 'NCP5501DT33RKG', 21, 285.39),
            ('NCP5501DT50G', 'mi NCP5501DT50G, 1 Low Dropout Voltage, Voltage Regulator 50', 50, 404.00),
            ('L4940D2T5', 'L4940D2T5', 5, 181.60),
            ('LM358D', 'LM358D', 13, 34.71),
            ('BC817', 'NPN80T23 BC817', 391, 105.57),
            ('100uF 6.3V DC', 'TT Cap 3528-21', 20, 231.60),
            ('BOURNS BRN5040TA-4R7M', 'BOURNS BRN5040TA-1R5M', 0, 0.00),
            ('APT2200', 'APT2200', 79, 1335.10),
            ('3 way JST XH B3B 3 Way', '3 way JST XH B3B 3 Way', 60, 600.00),
            ('PIC24FJ256GB204-I/SS', '20 PIN ISS', 18, 1223.20),
            ('C-680PF', 'Tube PU - 6x4 Black', 3631, 435.72),
            ('6ml Dipping Pipe', 'Tube PU - 6x4 Black', 50, 190.00),
            ('Green Push Button', 'P TO M 2A250VAC GREEN', 27, 181.43),
            ('20 Way IDC Sock with Strain', '20 Way IDC Sock with Strain', 30, 35.70),
            ('10 Way IDC Sock with Strain', '10 Way IDC Sock with Strain', 15, 11.25),
            ('PIC24FJ256GB206T-IPT', 'PIC24FJ256GB206T-TQFP', 1, 120.00),
            ('PIC24FJ256GB206-I/MR', 'PIC24FJ256GB206-I/MR', 1, 1638.70),
            ('TEST LEAD WIRE2.5mm', 'PRO BLACK 2.5MM TEST LEAD WIRE', 1, 325.04),
            ('3 Way PCB-45Deg', '3 Way PCB-45Deg', 200, 444.00),
            ('2 Way Green PCB 45 Deg 5mm', '2 Way PCB 5mm 45Deg', 30, 45.90),
            ('LM3578ANNOPB', 'OPBStep-down Switching Regulator, 1-Channel 750mA Adjustable', 0, 0.00),
            ('R-330R-0603', 'R-0603', 4483, 89.66),
            ('R-47K-0603', 'R-47K-0603 6%', 3506, 175.30),
            ('10nF', '20% 63V Polyester 5mm PCM', 3808, 1223.68),
            ('10nF-63V', 'C-10nF-63V', 90, 138.69),
            ('47nF-63V', 'C-47nF-63V', 115, 9.20),
            ('0R39 or 0R47', '0R39 5W wire wound resistor', 72, 496.80),
            ('Fuel Track housing ME652 Top cover Rev 2', '', 6, 4000.00),
            ('Fuel Track housing ME652 Top cover rev1', '', 5, 0.00),
            ('Fuel Track housing bottom ME652 vibase plate for production rev1', '', 5, 0.00),
            ('Fuel Track charger housing rev1', '', 5, 0.00),
            ('Batt housing v1', '', 5, 0.00),
            ('Silicone Crystal Fix All Super Clear', 'Silicone Crystal Fix All Super Clear', 1, 168.18),
            ('Android device', 'Huawei P30', 12, 54000.00),
            ('double sided tape 24mm', 'double sided tape 24mm', 1, 39.00),
            ('M4 x 15mm Screw', 'M4 x 20mm Screw', 50, 255.50),
            ('M4 x 20mm Screw', 'M4 x 20mm Screw', 40, 20.00),
            ('M8 Lock Nut S/S', 'M8 Lock Nut S/S', 50, 318.50),
            ('M8 washer S/S', 'M8 washer S/S', 70, 2.80),
            ('M8 Spring washer S/S', 'M8 Spring washer S/S', 85, 4.25),
            ('M3 x 8 pan or cheese head S/S', 'M3 x 8 pan or cheese head S/S', 100, 5.00),
            ('M3 x 10 MF hex spacer Plastic', 'M3 x 10 MF hex spacer Plastic', 0, 0.00),
            ('M3 x 10 MF hex spacer Brass', 'M3 x 10 MF hex spacer Brass', 10, 20.70),
            ('M3 Spring washer S/S', 'M3 A2 Stainless Steel Washer-Flat', 50, 4.00),
            ('M3 Nut Lock S/S', 'M3 A2-Stainless Steel Nut-Nyloc', 90, 44.10),
            ('M4 washer S/S', 'M4 washer S/S', 60, 2.76),
            ('M4 spring washer S/S', 'M4 spring washer S/S', 30, 2.07),
            ('M4 nuts lock S/S', 'M4 nuts lock S/S', 200, 152.00),
            ('BM00290', '2.5mm BLUE INS LUG 6.3MM FEMALE DISCON /100', 0, 0.00),
            ('BM00190', '1.5mm RED INS LUG 6.3MM FEMALE DISCON /100', 0, 0.00),
            ('PG 13.5 Cable Gland', 'POLYMER CABLE GLAND PG13.5', 29, 65.75),
            ('PG7 cable gland', 'PG7 cable gland', 0, 0.00),
            ('ME652', 'SCR12 PANEL IP65 400x300x220 ORANGE', 5, 15285.00),
            ('S10B Box Black', 'S10-B 85x66x30', 68, 2176.00),
            ('6V 12AHR SLA BATTERY', '6V 12AHR SLA BATTERY', 8, 1542.88),
            ('12V 2A 25W AC-DC DESKTOP PSU', '12V Power Pack', 28, 8262.52),
            ('3 Way Fus1 Connector', '3 way FUS1 WPisof', 10, 889.70),
            ('IEC Cable', 'IEC Cable', 15, 542.25),
            ('3PIN MAINS PLUG 1.8M + IEC PLUG - VDE APPROVAL', 'Hardware components', 0, 0.00),
            ('Joiners 6-6mm', 'Joiners 6-6mm', 91, 0.00),
            ('6mm T-piece', '6mm T-piece', 0, 0.00),
            ('Non return valve 6mm', 'Non return valve 6mm', 0, 0.00),
            ('Joiners 6-4mm', 'Joiners 6-4mm', 30, 391.20),
            ('6x4 T-pieces', 'Reducing Tee 6x4', 1, 0.00),
            ('Dipping 6mm pipe 1 roll', 'Tube PU - 6x4 - Black', 1, 493.00),
            ('Dipping 4mm pipe', 'Dipping 4mm pipe', 1, 390.00),
            ('NXP Differential Pressure Sensor, PCB Mount.mpx5050dp', 'Transducer', 82, 42952.91),
            ('Air Pump RS', 'Micro pump, Nylon body,Gas, Liquid, 3V', 28, 49431.68),
            ('2.5mm Header pin 2way', '40P SIL P.HED 2.54 X 6MM', 100, 269.00),
            ('JUMPER 2.54MM', 'JUMPER 2.54MM NO TAIL', 100, 30.00),
            ('2 Way green', '2WP-5MM', 0, 0.00),
            ('2.5mm Header pin 3way', '3WP', 100, 336.00),
            ('3 way green 5mm', '3WP-5MM', 83, 311.11),
            ('10 WAY DIP SWITCH', 'Surface Mount DIP Switch Single Pole Single Throw (SPST), Plain', 29, 513.01),
            ('USB A type 3 verts2', 'USB 3.0 RECEPTACLE TYPE A VERTICAL DUAL', 22, 1089.12),
            ('6 Way Header', '6 way header', 79, 57.67),
            ('10 Way straight header', '10 Way, 2 Row, Straight PCB Header', 35, 1524.60),
            ('20 Way box header vert', 'olutions T821 Series Straight Through Hole PCB Header, 20 Con', 73, 543.41),
            ('Molex-pin', 'Molex, Micro-Fit 3.0 Female Crimp Terminal Contact', 0, 0.00),
            ('Molex, Micro-Fit 3.0 PCB', '4 way 2 row vertical header,3mm pitch', 60, 1333.63),
            ('Molex, Micro-Fit 3.0 Female', 'Molex, Micro-Fit 3.0 Female Connector Housing', 64, 547.44),
            ('470uF 25V SMD', '470uF 25V F SMD', 881, 3532.81),
            ('470uF 35V', 'electrolytic capacitor SMD', 402, 522.60),
            ('1000uF 10V', 'electrolytic capacitor SMD', 238, 1720.26),
            ('1500uF-6.3V', 'electrolytic capacitor SMD', 342, 2462.06),
            ('470uF 25-35V LOW ESR', 'electrolytic capacitor SMD', 32, 70.72),
            ('4700uF -6.3V', 'electrolytic capacitor 35V dc', 0, 0.00),
            ('4K7', '0402', 7697, 3309.71),
            ('1R0-0603', '0603', 8000, 180.00),
            ('1nF', 'C-0603', 3865, 773.00),
            ('1uF 0603', 'C-0603', 2533, 405.28),
            ('220nf', 'C-0603', 732, 688.54),
            ('220nf', '0805', 2, 0.48),
            ('2n2 or 2.2nF', 'C-0603', 660, 264.00),
            ('C-10uF 16V', 'C-0805', 344, 96.32),
            ('C-10uF 50V', 'C-0805', 125, 578.75),
            ('10uF 0603 25V', 'C-0603', 3788, 113.64),
            ('47pF', 'C-0603', 0, 0.00),
            ('100R', 'C-0603', 0, 0.00),
            ('100nF', 'C-0603', 1460, 452.60),
            ('100pF', 'C-0603', 3155, 589.31),
            ('470pF', 'C-0603', 3218, 3813.33),
            ('10nF', 'C-0805', 200, 32.00),
            ('10nF 0603', 'C-0603', 3335, 1597.46),
            ('10uF 35V', 'C-0805', 3000, 750.00),
            ('220 uF 16V', 'electrolytic capacitor radial', 800, 2065.00),
            ('220 uF 35V', 'electrolytic capacitor radial', 700, 2065.00),
            ('47uF 16V', 'electrolytic capacitor SMD', 734, 425.72),
            ('220 uF 35V', 'electrolytic capacitor radial', 0, 0.00),
            ('47uF 6.3V 0805', 'electrolytic capacitor SMD', 0, 0.00),
            ('10uF-63V', 'C-0805', 0, 0.00),
            ('220uF 6.3V', 'electrolytic capacitor SMD', 377, 985.55),
            ('220uF 16V', 'electrolytic capacitor SMD', 698, 2862.87),
            ('220uF 35V', 'electrolytic capacitor SMD', 500, 1615.00),
            ('470uF 63V', 'electrolytic capacitor SMD', 5, 9760.00),
            ('10uF 10-18V T-Y', 'TT Cap SMD', 30, 166.02),
            ('6Vdc DPDT 3A', 'Relay 6V D-P-D-T D2N V23105A53', 22, 286.00),
            ('Relay 24V D-P-D-T', '24VDC 2 C/O 8A 240VAC', 10, 193.40),
            ('Relay 12Vdc D-D-T', 'Relay 12Vdc D-D-T', 23, 579.14),
            ('Relay NT90 24V 1C', '24VDC 1 C/O 30A 240VAC', 14, 257.74),
            ('15uH 3A inductor', 'INDUCTOR SMD SHIELDED 15uh', 40, 1343.60),
            ('CIM10U800NC Ferrite bead', 'CIM10U800NC Ferrite bead', 2803, 6054.48),
            ('4.7uH 6.8A', 'RS inductor size 27', 0, 0.00),
            ('Heatsink, 25K/W, 23 x 13 x 10mm, Solder', 'Heatsink, 25K/W, 23 x 13 x 10mm, Solder', 10, 445.36),
            ('15uH 5A', 'VISHAY LOW PROFILE IHLP', 15, 140.34),
            ('22uH 5A', 'VISHAY LOW PROFILE IHLP', 20, 2004.96),
            ('BC807', 'N Semi BC807-25WT1G PNP Digital Transistor, 45 V, 3 Pin SC-70', 2050, 2472.30),
            ('Texas Instruments CD4541BM', 'Regulators IC and Transistors', 0, 0.00),
            ('BH1620FVC-TR', '4541 SOIC14', 89, 1021.76),
            ('50mA 5V LDO', 'Ambient Light Sensor', 2, 34.44),
            ('Microchip MCP9700T-E/TT', 'LD2980ABM50TR 5V', 56, 352.26),
            ('LT1961IMSE#PBF', 'MCP9700T-E/TT', 125, 755.88),
            ('MCP9700T-E/TT', 'Boost regulator Analog Devices 2A', 20, 2169.80),
            ('MCP9700AT-E/TT', 'MCP9700AT-E/TT', 26, 432.38),
            ('MIC5219 3.6', 'MIC5219 3.6', 98, 3565.24),
            ('Texas Instruments NE555D', 'NE555DR RS 624661', 100, 2063.00),
            ('DMP2305U-7', 'P CHAN FET DMP2305U-7', 0, 0.00),
            ('PAM2314AE', 'PAM2314AE', 0, 0.00),
            ('PIC24FJ32KA301-I/SS', 'PIC24FJ32KA301-I/SS', 18, 1186.38),
            ('Microchip BC807-25', 'PNP-SOT23', 2439, 998.99),
            ('TLP185 Photocoupler', 'TLP185 Opto OR 10 TLP185GB', 79, 288.94),
            ('TPS5430D', 'TPS5430D', 90, 8996.40),
            ('Green LED 3mm Clear', 'LED GRN 3MM SUPERBRIGHT CLEAR', 30, 48.60),
            ('Blue LED 3mm Clear', 'BLUE 3MM 120DEG', 22, 59.84),
            ('Red LED 3mm Clear', 'LED RED 3MM SUPERBRIGHT', 42, 59.84),
            ('Orange LED 3mm Clear', 'YEL 3MM SUPERBRIGHT CLEAR', 212, 116.60),
            ('Orange LED 0805', 'LED 0805', 0, 0.00),
            ('Blue LED 0805', 'LED 0805', 3209, 4856.69),
            ('GREEN LED 0805', 'LED 0805', 3201, 3553.11),
            ('YELLOW LED 0805', 'YELLOW 120MCD 0805', 2915, 2915.00),
            ('Red LED', 'LED 0805', 1327, 1831.26),
            ('4148', '4148 (Melf)', 293, 58.60),
            ('40V 5A Schottky SS34', 'DO-214AB (Diode)', 250, 2102.50),
            ('3956 5A Schottky Diode 60V', 'DO-214AB 3956', 473, 1575.09),
            ('30V zener Diode 5% 5w axial', '1KV 1A SMA SMD RECT', 647, 1777.92),
            ('30V zener Diode 5% 5w axial', '30V zener Diode 5% 5w axial', 200, 230.00),
            ('30V zener melf', '30V zener Diode 5% 500 mW', 200, 10070.00),
            ('2ZENER SMD 8v2', 'ZEN. DIODE 8.2V 500M W SOD80C', 1790, 930.80),
            ('13v', 'ZENER MelfD', 140, 35.00),
            ('4v7 ZENER MELF DIODE', 'ZEN DIODE4.7V 500mW SOD80C', 2050, 863.50),
            ('Zen Diode 5v6', 'ZEN.DIODE 5.6V 500mW SOD80C', 1985, 1041.45),
            ('10mA resettable fuse 3 Amp trip MF 300', 'ms 3A Hold current, Radial Leaded PCB Mount Resettable Fuse, 24V', 36, 321.91),
            ('POLY FUSE, MSMF110-24.X2', 'Bourns 1.1A Surface Mount Resettable Fuse, 24V', 30, 333.84),
            ('0R-0603', 'R-0603', 3114, 62.28),
            ('0R 1206', 'R-1206', 4625, 92.50),
            ('1k', 'R-0603', 5224, 216.01),
            ('1M', 'R-0603', 1245, 149.40),
            ('2k', 'R-0603', 4235, 279.51),
            ('2K2', 'R-0603', 4323, 605.22),
            ('3K3', 'R-0603', 4200, 126.00),
            ('3K3', 'R-0603', 3208, 96.24),
            ('4K7', 'R-0603', 3395, 101.85),
            ('5K6', 'R-0603', 4100, 656.00),
            ('180K', 'R-0623-180K', 4647, 149.74),
            ('10K', 'R-0603', 3161, 126.44),
            ('R-10R-0603', 'R-0603', 2703, 135.15),
            ('15K', 'R-0603', 3164, 125.76),
            ('33K', '33K +-5% 1/16W 0603', 4595, 162.60),
            ('51K', 'R-0603', 4789, 1560.37),
            ('56K', 'R-0603', 4789, 3352.30),
            ('84.5K', 'R-0603', 300, 591.00),
            ('100K', 'R-0603', 5000, 200.00),
            ('110K', 'R-0603', 4100, 1312.00),
            ('150K', 'R-0603', 400, 98.10),
            ('220K', 'R-0603', 4048, 202.40),
            ('270K', 'R-0603', 4440, 88.80),
            ('R-470R-0603', 'R-0603', 4526, 135.78),
            ('680K', 'R-0603', 4488, 179.52),
            ('680R', 'R-0603', 3686, 147.44),
            ('0R82', 'R-1206', 800, 776.00),
            ('10R', 'R-0805', 4263, 596.82),
            ('MOVS', 'MOVS', 0, 0.00),
            ('S14K40 AUTO MOV', 'MOV', 27, 132.30),
            ('S14K420', '14MM MOV 420V', 60, 246.00),
            ('S14K250 MOV', 'MOV', 30, 120.00),
            ('C-220uF 6.3V SMD', 'Panasonic 220uF Polymer Capacitor', 114, 996.36),
            ('INA125', '', 40, 4847.20),
            ('533-5862', 'LM357AN', 5, 250.80),
            ('Fuel Track Led Card Rev 8', 'PCB-LED Card Rev 8', 6, 2184.00),
            ('Fuel Track Led Card Rev 8', 'PCB-LED Card Rev 8', 5, 551.85)
        ) AS t(part_number, description, quantity, total_value)
    LOOP
        -- Determine name (prefer description, fallback to part number)
        item_name := COALESCE(NULLIF(item_record.description, ''), item_record.part_number);
        
        -- Skip if no name
        IF item_name IS NULL OR item_name = '' THEN
            CONTINUE;
        END IF;
        
        -- Calculate unit cost
        IF item_record.quantity > 0 THEN
            unit_cost := ROUND((item_record.total_value / item_record.quantity)::NUMERIC, 2);
        ELSE
            unit_cost := 0;
        END IF;
        
        -- Calculate reorder point and quantity
        reorder_point := GREATEST(1, FLOOR(item_record.quantity * 0.2));
        reorder_qty := GREATEST(10, FLOOR(item_record.quantity * 0.3));
        
        -- Determine status
        IF item_record.quantity > reorder_point THEN
            item_status := 'in_stock';
        ELSIF item_record.quantity > 0 AND item_record.quantity <= reorder_point THEN
            item_status := 'low_stock';
        ELSE
            item_status := 'out_of_stock';
        END IF;
        
        -- Determine category and type
        item_category := determine_inventory_category(item_record.part_number, item_record.description);
        item_type := determine_inventory_type(item_record.part_number);
        
        -- Generate SKU
        sku_text := 'SKU' || LPAD(next_sku_num::TEXT, 4, '0');
        next_sku_num := next_sku_num + 1;
        
        -- Generate a unique ID (simple unique string compatible with Prisma TEXT id)
        item_id := REPLACE(gen_random_uuid()::TEXT, '-', '');
    
        -- Insert the item
        INSERT INTO "InventoryItem" (
            id,
            sku,
            name,
            thumbnail,
            category,
            type,
            quantity,
            unit,
            "reorderPoint",
            "reorderQty",
            location,
            "unitCost",
            "totalValue",
            supplier,
            status,
            "lastRestocked",
            "ownerId",
            "createdAt",
            "updatedAt"
        ) VALUES (
            item_id,
            sku_text,
            item_name,
            '',
            item_category,
            item_type,
            item_record.quantity,
            'pcs',
            reorder_point,
            reorder_qty,
            '',
            unit_cost,
            item_record.total_value,
            '',
            item_status,
            NOW(),
            NULL,
            NOW(),
            NOW()
        );
    END LOOP;
    
    RAISE NOTICE '✅ Successfully inserted inventory items. Starting SKU was: %, Next available SKU: %', max_sku_num + 1, next_sku_num;
END $$;

-- Clean up helper functions (optional - remove if you want to keep them for future use)
DROP FUNCTION IF EXISTS determine_inventory_category(TEXT, TEXT);
DROP FUNCTION IF EXISTS determine_inventory_type(TEXT);

