#!/usr/bin/env node
/**
 * Script to add stock items to inventory from the provided list
 * Usage: node add-stock-items-to-inventory.js
 */

const stockItems = [
  { partNumber: "250mA 5x20mm Fuse", description: "250mA F Glass Cartridge Fuse 5x20mm", quantity: 50, totalValue: 344.55 },
  { partNumber: "500mA 5x20mm Fuse", description: "500mA F Glass Cartridge Fuse 5x20mm", quantity: 120, totalValue: 844.56 },
  { partNumber: "1A 5x20mm Fuse", description: "1A F Glass Cartridge Fuse 5x20mm", quantity: 60, totalValue: 264.60 },
  { partNumber: "1.5A 5x20mm Fuse", description: "1.5A F Glass Cartridge Fuse 5x20mm", quantity: 100, totalValue: 889.10 },
  { partNumber: "Fuse Holder for 5 x 20mm Fuse, 1P, 250V ac", description: "Fuse Holder for 5 x 20mm Fuse, 1P, 250V ac", quantity: 10, totalValue: 575.10 },
  { partNumber: "M4 A2 S/S Nut-Nyloc", description: "M4 A2 S/S Nut-Nyloc", quantity: 200, totalValue: 74.00 },
  { partNumber: "M4 A2 spring washer S/S", description: "M4 A2 spring washer S/S", quantity: 200, totalValue: 18.00 },
  { partNumber: "M4 A2 S/S NUT", description: "M4 A2 S/S NUT", quantity: 200, totalValue: 36.00 },
  { partNumber: "47UF 25V", description: "27UF 25V LOW Z RADIAL", quantity: 60, totalValue: 16.68 },
  { partNumber: "1734-0704-4P-CL0M-ND", description: "REC,4P,BLK,FLANG", quantity: 12, totalValue: 2567.52 },
  { partNumber: "DIODE 1N4148 MELF", description: "100V 0.45A SW.DIODE SOD80C", quantity: 2500, totalValue: 350.00 },
  { partNumber: "Tact Switch", description: "Tact Switch5W-KPT1104", quantity: 6, totalValue: 16.14 },
  { partNumber: "DMP2305U-7", description: "DMP2305U-7", quantity: 15, totalValue: 27.15 },
  { partNumber: "Orange M-STEEL enclosure", description: "Orange M-STEEL enclosure", quantity: 5, totalValue: 8120.00 },
  { partNumber: "R-1M", description: "R-1M", quantity: 70, totalValue: 4.62 },
  { partNumber: "Underground Phone", description: "Underground Phone", quantity: 4, totalValue: 17964.00 },
  { partNumber: "Battery Holder Coin Cell", description: "Battery Holder Coin Cell", quantity: 10, totalValue: 186.52 },
  { partNumber: "Fuel Track Completed Unit", description: "Complete fuel track", quantity: 4, totalValue: 36000.00 },
  { partNumber: "Black 4mm Banana Jack", description: "Black 4mm Banana Jack", quantity: 0, totalValue: 0.00 },
  { partNumber: "Red Terminal", description: "mm Banana Jack (Blue Terminal - 72M606) (Green Terminal - 72", quantity: 6, totalValue: 1.62 },
  { partNumber: "20mm Top-Knob", description: "20mm Top-Knob", quantity: 12, totalValue: 18.72 },
  { partNumber: "31mm Top-Knob", description: "OKW 20mm Grey Top-Knob", quantity: 4, totalValue: 30.00 },
  { partNumber: "8 Pin DIP IC Socket", description: "8 Pin DIL Tulip Type IC Socket", quantity: 4, totalValue: 1.32 },
  { partNumber: "9 Volt PP3", description: "9 Volt PP3 Alkaline Battery", quantity: 0, totalValue: 0.00 },
  { partNumber: "RM8 12 Pin Former", description: "RM8 8 or 12 Pin Former 1 x Required", quantity: 30, totalValue: 60.30 },
  { partNumber: "RM8 Cores (2 Req)", description: "RM8 Cores (2 Req)", quantity: 400, totalValue: 800.00 },
  { partNumber: "RM8 Ferrite Core (N30)", description: "RM8 Ferrite Core (N30) 2 x Required", quantity: 8, totalValue: 74.16 },
  { partNumber: "ICM7555CN", description: "CMOS Timer", quantity: 5, totalValue: 81.25 },
  { partNumber: "TLC277CP", description: "Op Amp", quantity: 8, totalValue: 0.00 },
  { partNumber: "MCR100-6", description: "Switching Regulator", quantity: 8, totalValue: 44.80 },
  { partNumber: "600 Volt SCR", description: "600 Volt SCR TO-92", quantity: 30, totalValue: 41.10 },
  { partNumber: "BC547B", description: "NPN Transistor TO-92", quantity: 30, totalValue: 9.30 },
  { partNumber: "BC557B", description: "PNP Transistor TO-92", quantity: 100, totalValue: 39.00 },
  { partNumber: "BS250P", description: "P-Channel FET", quantity: 10, totalValue: 111.20 },
  { partNumber: "1N4148", description: "Switching Diode Axial", quantity: 10, totalValue: 1.60 },
  { partNumber: "FR105", description: "600 Volt 1 Amp Fast Recovery Diode Axial", quantity: 15, totalValue: 3.30 },
  { partNumber: "1N5817", description: "1 Amp 20 Volt Schottky Diode", quantity: 6, totalValue: 1.50 },
  { partNumber: "LM385Z-1.2", description: "Precision 1.2 Volt Shunt Regulator TO-92", quantity: 6, totalValue: 27.45 },
  { partNumber: "C-PF-1000uf", description: "20% 16 Volt Electrolytic Radial Low ESR", quantity: 160, totalValue: 256.00 },
  { partNumber: "C-PF-10uf", description: "20% 16 Volt Tantalum Tag 5mm PCM", quantity: 20, totalValue: 49.00 },
  { partNumber: "C-PF-2.2uf", description: "20% 25 Volt Tantalum Tag 5mm PCM", quantity: 27, totalValue: 47.25 },
  { partNumber: "C-PF-1uf", description: "20% 63 Volt Polyester 5mm PCM", quantity: 15, totalValue: 45.75 },
  { partNumber: "C-PF-470nf", description: "20% 250/275 Volt AC Polyprop 22mm PCM", quantity: 100, totalValue: 27.00 },
  { partNumber: "C-PF-100nf", description: "20% 63 Volt Polyester 5mm PCM", quantity: 60, totalValue: 183.00 },
  { partNumber: "C-PF-22nf", description: "20% 250/275 Volt AC Polyprop 10mm PCM", quantity: 20, totalValue: 5.40 },
  { partNumber: "C-PR-10nf", description: "20% 63 Volt Polyester 5mm PCM", quantity: 40, totalValue: 26.00 },
  { partNumber: "C-PR-1nf", description: "20% 63 Volt Polyester 5mm PCM", quantity: 114, totalValue: 152.76 },
  { partNumber: "R-MF-220K", description: "1% 1/4 Watt Metal Film Resistor", quantity: 100, totalValue: 52.00 },
  { partNumber: "R-MF-180K", description: "1% 1/4 Watt Metal Film Resistor", quantity: 110, totalValue: 26.40 },
  { partNumber: "R-MF-100K", description: "1% 1/4 Watt Metal Film Resistor", quantity: 100, totalValue: 52.00 },
  { partNumber: "R-MF-68K", description: "1% 1/4 Watt Metal Film Resistor", quantity: 400, totalValue: 172.00 },
  { partNumber: "R-MF-47K", description: "1% 1/4 Watt Metal Film Resistor", quantity: 100, totalValue: 30.00 },
  { partNumber: "R-MF-4K7", description: "1% 1/4 Watt Metal Film Resistor", quantity: 100, totalValue: 47.00 },
  { partNumber: "Varistor 18V", description: "Panasonic, V Surge Absorber 1.6nF 1A, Clamping 40V, Varistor 18V", quantity: 20, totalValue: 108.60 },
  { partNumber: "1.5nF 50V", description: "1.5nF 50V Capacitor", quantity: 3, totalValue: 70.00 },
  { partNumber: "SD memory card", description: "R-0603", quantity: 500, totalValue: 300.00 },
  { partNumber: "R4K8-0603", description: "R-0603", quantity: 5000, totalValue: 0.00 },
  { partNumber: "R-1603-1K5", description: "1K5 +- 1% 1/10W 0603", quantity: 4304, totalValue: 636.56 },
  { partNumber: "Connector Plug 12 Way", description: "enol Industrial, AT Automotive Connector Plug 12 Way, Crimp Termi", quantity: 10, totalValue: 705.10 },
  { partNumber: "RM8 12 Pin Former", description: "RM8 12 Pin Former", quantity: 4, totalValue: 176.24 },
  { partNumber: "Black Banana Plug", description: "Black Male Banana Plug - Solder Termination, 30 V ac, 60V dc, 30A", quantity: 4, totalValue: 99.04 },
  { partNumber: "Red Banana Plug", description: "Red Male Banana Plug - Solder Termination, 30 V ac, 60V dc, 30A", quantity: 4, totalValue: 99.20 },
  { partNumber: "Wedgelock", description: "DT 12 Way Wedgelock for use with Automotive Connectors", quantity: 27, totalValue: 218.97 },
  { partNumber: "DT Automotive Connector Socket 12 Way", description: "DT Flanged receptacle 12 pin", quantity: 9, totalValue: 1724.13 },
  { partNumber: "102102EX", description: "EX JUNCTION BOX 25MM GLAND IP68R Zone 1,2,21,22", quantity: 0, totalValue: 0.00 },
  { partNumber: "JUNCTION BOX 25mm IP68 - Black", description: "JUNCTION BOX 25mm IP68 - Black", quantity: 0, totalValue: 0.00 },
  { partNumber: "M25 x 1.5 cable gland", description: "M25 x 1.5 cable gland", quantity: 20, totalValue: 242.00 },
  { partNumber: "R-2K2 watt axial", description: "R-2K2 watt axial", quantity: 125, totalValue: 31.25 },
  { partNumber: "10R 5W Wire wound axial", description: "10R 5W Wire wound axial", quantity: 70, totalValue: 50.00 },
  { partNumber: "F.HOLD 5x20mm - Fuse box", description: "F.HOLD 5x20mm - Fuse box", quantity: 40, totalValue: 234.50 },
  { partNumber: "1R8 +-5% wire wound axial", description: "1R8 +-5% wire wound axial", quantity: 13, totalValue: 20.54 },
  { partNumber: "1R +-5% 5WW WND", description: "1R +-5% 5WW WND", quantity: 0, totalValue: 0.00 },
  { partNumber: "R-680R-0603", description: "R-0603", quantity: 2877, totalValue: 316.47 },
  { partNumber: "Red-LED-0603", description: "LED 0603", quantity: 116, totalValue: 0.00 },
  { partNumber: "Green-LED-0603", description: "LED 0603", quantity: 180, totalValue: 178.20 },
  { partNumber: "Blue-LED-0603", description: "LED 0603", quantity: 127, totalValue: 142.24 },
  { partNumber: "NCP5501DT33RKG", description: "NCP5501DT33RKG", quantity: 21, totalValue: 285.39 },
  { partNumber: "NCP5501DT50G", description: "mi NCP5501DT50G, 1 Low Dropout Voltage, Voltage Regulator 50", quantity: 50, totalValue: 404.00 },
  { partNumber: "L4940D2T5", description: "L4940D2T5", quantity: 5, totalValue: 181.60 },
  { partNumber: "LM358D", description: "LM358D", quantity: 13, totalValue: 34.71 },
  { partNumber: "BC817", description: "NPN80T23 BC817", quantity: 391, totalValue: 105.57 },
  { partNumber: "100uF 6.3V DC", description: "TT Cap 3528-21", quantity: 20, totalValue: 231.60 },
  { partNumber: "BOURNS BRN5040TA-4R7M", description: "BOURNS BRN5040TA-1R5M", quantity: 0, totalValue: 0.00 },
  { partNumber: "APT2200", description: "APT2200", quantity: 79, totalValue: 1335.10 },
  { partNumber: "3 way JST XH B3B 3 Way", description: "3 way JST XH B3B 3 Way", quantity: 60, totalValue: 600.00 },
  { partNumber: "PIC24FJ256GB204-I/SS", description: "20 PIN ISS", quantity: 18, totalValue: 1223.20 },
  { partNumber: "C-680PF", description: "Tube PU - 6x4 Black", quantity: 3631, totalValue: 435.72 },
  { partNumber: "6ml Dipping Pipe", description: "Tube PU - 6x4 Black", quantity: 50, totalValue: 190.00 },
  { partNumber: "Green Push Button", description: "P TO M 2A250VAC GREEN", quantity: 27, totalValue: 181.43 },
  { partNumber: "20 Way IDC Sock with Strain", description: "20 Way IDC Sock with Strain", quantity: 30, totalValue: 35.70 },
  { partNumber: "10 Way IDC Sock with Strain", description: "10 Way IDC Sock with Strain", quantity: 15, totalValue: 11.25 },
  { partNumber: "PIC24FJ256GB206T-IPT", description: "PIC24FJ256GB206T-TQFP", quantity: 1, totalValue: 120.00 },
  { partNumber: "PIC24FJ256GB206-I/MR", description: "PIC24FJ256GB206-I/MR", quantity: 1, totalValue: 1638.70 },
  { partNumber: "TEST LEAD WIRE2.5mm", description: "PRO BLACK 2.5MM TEST LEAD WIRE", quantity: 1, totalValue: 325.04 },
  { partNumber: "3 Way PCB-45Deg", description: "3 Way PCB-45Deg", quantity: 200, totalValue: 444.00 },
  { partNumber: "2 Way Green PCB 45 Deg 5mm", description: "2 Way PCB 5mm 45Deg", quantity: 30, totalValue: 45.90 },
  { partNumber: "LM3578ANNOPB", description: "OPBStep-down Switching Regulator, 1-Channel 750mA Adjustable", quantity: 0, totalValue: 0.00 },
  { partNumber: "R-330R-0603", description: "R-0603", quantity: 4483, totalValue: 89.66 },
  { partNumber: "R-47K-0603", description: "R-47K-0603 6%", quantity: 3506, totalValue: 175.30 },
  { partNumber: "10nF", description: "20% 63V Polyester 5mm PCM", quantity: 3808, totalValue: 1223.68 },
  { partNumber: "10nF-63V", description: "C-10nF-63V", quantity: 90, totalValue: 138.69 },
  { partNumber: "47nF-63V", description: "C-47nF-63V", quantity: 115, totalValue: 9.20 },
  { partNumber: "0R39 or 0R47", description: "0R39 5W wire wound resistor", quantity: 72, totalValue: 496.80 },
  { partNumber: "Fuel Track housing ME652 Top cover Rev 2", description: "", quantity: 6, totalValue: 4000.00 },
  { partNumber: "Fuel Track housing ME652 Top cover rev1", description: "", quantity: 5, totalValue: 0.00 },
  { partNumber: "Fuel Track housing bottom ME652 vibase plate for production rev1", description: "", quantity: 5, totalValue: 0.00 },
  { partNumber: "Fuel Track charger housing rev1", description: "", quantity: 5, totalValue: 0.00 },
  { partNumber: "Batt housing v1", description: "", quantity: 5, totalValue: 0.00 },
  { partNumber: "Silicone Crystal Fix All Super Clear", description: "Silicone Crystal Fix All Super Clear", quantity: 1, totalValue: 168.18 },
  { partNumber: "Android device", description: "Huawei P30", quantity: 12, totalValue: 54000.00 },
  { partNumber: "double sided tape 24mm", description: "double sided tape 24mm", quantity: 1, totalValue: 39.00 },
  { partNumber: "M4 x 15mm Screw", description: "M4 x 20mm Screw", quantity: 50, totalValue: 255.50 },
  { partNumber: "M4 x 20mm Screw", description: "M4 x 20mm Screw", quantity: 40, totalValue: 20.00 },
  { partNumber: "M8 Lock Nut S/S", description: "M8 Lock Nut S/S", quantity: 50, totalValue: 318.50 },
  { partNumber: "M8 washer S/S", description: "M8 washer S/S", quantity: 70, totalValue: 2.80 },
  { partNumber: "M8 Spring washer S/S", description: "M8 Spring washer S/S", quantity: 85, totalValue: 4.25 },
  { partNumber: "M3 x 8 pan or cheese head S/S", description: "M3 x 8 pan or cheese head S/S", quantity: 100, totalValue: 5.00 },
  { partNumber: "M3 x 10 MF hex spacer Plastic", description: "M3 x 10 MF hex spacer Plastic", quantity: 0, totalValue: 0.00 },
  { partNumber: "M3 x 10 MF hex spacer Brass", description: "M3 x 10 MF hex spacer Brass", quantity: 10, totalValue: 20.70 },
  { partNumber: "M3 Spring washer S/S", description: "M3 A2 Stainless Steel Washer-Flat", quantity: 50, totalValue: 4.00 },
  { partNumber: "M3 Nut Lock S/S", description: "M3 A2-Stainless Steel Nut-Nyloc", quantity: 90, totalValue: 44.10 },
  { partNumber: "M4 washer S/S", description: "M4 washer S/S", quantity: 60, totalValue: 2.76 },
  { partNumber: "M4 spring washer S/S", description: "M4 spring washer S/S", quantity: 30, totalValue: 2.07 },
  { partNumber: "M4 nuts lock S/S", description: "M4 nuts lock S/S", quantity: 200, totalValue: 152.00 },
  { partNumber: "BM00290", description: "2.5mm BLUE INS LUG 6.3MM FEMALE DISCON /100", quantity: 0, totalValue: 0.00 },
  { partNumber: "BM00190", description: "1.5mm RED INS LUG 6.3MM FEMALE DISCON /100", quantity: 0, totalValue: 0.00 },
  { partNumber: "PG 13.5 Cable Gland", description: "POLYMER CABLE GLAND PG13.5", quantity: 29, totalValue: 65.75 },
  { partNumber: "PG7 cable gland", description: "PG7 cable gland", quantity: 0, totalValue: 0.00 },
  { partNumber: "ME652", description: "SCR12 PANEL IP65 400x300x220 ORANGE", quantity: 5, totalValue: 15285.00 },
  { partNumber: "S10B Box Black", description: "S10-B 85x66x30", quantity: 68, totalValue: 2176.00 },
  { partNumber: "6V 12AHR SLA BATTERY", description: "6V 12AHR SLA BATTERY", quantity: 8, totalValue: 1542.88 },
  { partNumber: "12V 2A 25W AC-DC DESKTOP PSU", description: "12V Power Pack", quantity: 28, totalValue: 8262.52 },
  { partNumber: "3 Way Fus1 Connector", description: "3 way FUS1 WPisof", quantity: 10, totalValue: 889.70 },
  { partNumber: "IEC Cable", description: "IEC Cable", quantity: 15, totalValue: 542.25 },
  { partNumber: "3PIN MAINS PLUG 1.8M + IEC PLUG - VDE APPROVAL", description: "Hardware components", quantity: 0, totalValue: 0.00 },
  { partNumber: "Joiners 6-6mm", description: "Joiners 6-6mm", quantity: 91, totalValue: 0.00 },
  { partNumber: "6mm T-piece", description: "6mm T-piece", quantity: 0, totalValue: 0.00 },
  { partNumber: "Non return valve 6mm", description: "Non return valve 6mm", quantity: 0, totalValue: 0.00 },
  { partNumber: "Joiners 6-4mm", description: "Joiners 6-4mm", quantity: 30, totalValue: 391.20 },
  { partNumber: "6x4 T-pieces", description: "Reducing Tee 6x4", quantity: 1, totalValue: 0.00 },
  { partNumber: "Dipping 6mm pipe 1 roll", description: "Tube PU - 6x4 - Black", quantity: 1, totalValue: 493.00 },
  { partNumber: "Dipping 4mm pipe", description: "Dipping 4mm pipe", quantity: 1, totalValue: 390.00 },
  { partNumber: "NXP Differential Pressure Sensor, PCB Mount.mpx5050dp", description: "Transducer", quantity: 82, totalValue: 42952.91 },
  { partNumber: "Air Pump RS", description: "Micro pump, Nylon body,Gas, Liquid, 3V", quantity: 28, totalValue: 49431.68 },
  { partNumber: "2.5mm Header pin 2way", description: "40P SIL P.HED 2.54 X 6MM", quantity: 100, totalValue: 269.00 },
  { partNumber: "JUMPER 2.54MM", description: "JUMPER 2.54MM NO TAIL", quantity: 100, totalValue: 30.00 },
  { partNumber: "2 Way green", description: "2WP-5MM", quantity: 0, totalValue: 0.00 },
  { partNumber: "2.5mm Header pin 3way", description: "3WP", quantity: 100, totalValue: 336.00 },
  { partNumber: "3 way green 5mm", description: "3WP-5MM", quantity: 83, totalValue: 311.11 },
  { partNumber: "10 WAY DIP SWITCH", description: "Surface Mount DIP Switch Single Pole Single Throw (SPST), Plain", quantity: 29, totalValue: 513.01 },
  { partNumber: "USB A type 3 verts2", description: "USB 3.0 RECEPTACLE TYPE A VERTICAL DUAL", quantity: 22, totalValue: 1089.12 },
  { partNumber: "6 Way Header", description: "6 way header", quantity: 79, totalValue: 57.67 },
  { partNumber: "10 Way straight header", description: "10 Way, 2 Row, Straight PCB Header", quantity: 35, totalValue: 1524.60 },
  { partNumber: "20 Way box header vert", description: "olutions T821 Series Straight Through Hole PCB Header, 20 Con", quantity: 73, totalValue: 543.41 },
  { partNumber: "Molex-pin", description: "Molex, Micro-Fit 3.0 Female Crimp Terminal Contact", quantity: 0, totalValue: 0.00 },
  { partNumber: "Molex, Micro-Fit 3.0 PCB", description: "4 way 2 row vertical header,3mm pitch", quantity: 60, totalValue: 1333.63 },
  { partNumber: "Molex, Micro-Fit 3.0 Female", description: "Molex, Micro-Fit 3.0 Female Connector Housing", quantity: 64, totalValue: 547.44 },
  { partNumber: "470uF 25V SMD", description: "470uF 25V F SMD", quantity: 881, totalValue: 3532.81 },
  { partNumber: "470uF 35V", description: "electrolytic capacitor SMD", quantity: 402, totalValue: 522.60 },
  { partNumber: "1000uF 10V", description: "electrolytic capacitor SMD", quantity: 238, totalValue: 1720.26 },
  { partNumber: "1500uF-6.3V", description: "electrolytic capacitor SMD", quantity: 342, totalValue: 2462.06 },
  { partNumber: "470uF 25-35V LOW ESR", description: "electrolytic capacitor SMD", quantity: 32, totalValue: 70.72 },
  { partNumber: "4700uF -6.3V", description: "electrolytic capacitor 35V dc", quantity: 0, totalValue: 0.00 },
  { partNumber: "4K7", description: "0402", quantity: 7697, totalValue: 3309.71 },
  { partNumber: "1R0-0603", description: "0603", quantity: 8000, totalValue: 180.00 },
  { partNumber: "1nF", description: "C-0603", quantity: 3865, totalValue: 773.00 },
  { partNumber: "1uF 0603", description: "C-0603", quantity: 2533, totalValue: 405.28 },
  { partNumber: "220nf", description: "C-0603", quantity: 732, totalValue: 688.54 },
  { partNumber: "220nf", description: "0805", quantity: 2, totalValue: 0.48 },
  { partNumber: "2n2 or 2.2nF", description: "C-0603", quantity: 660, totalValue: 264.00 },
  { partNumber: "C-10uF 16V", description: "C-0805", quantity: 344, totalValue: 96.32 },
  { partNumber: "C-10uF 50V", description: "C-0805", quantity: 125, totalValue: 578.75 },
  { partNumber: "10uF 0603 25V", description: "C-0603", quantity: 3788, totalValue: 113.64 },
  { partNumber: "47pF", description: "C-0603", quantity: 0, totalValue: 0.00 },
  { partNumber: "100R", description: "C-0603", quantity: 0, totalValue: 0.00 },
  { partNumber: "100nF", description: "C-0603", quantity: 1460, totalValue: 452.60 },
  { partNumber: "100pF", description: "C-0603", quantity: 3155, totalValue: 589.31 },
  { partNumber: "470pF", description: "C-0603", quantity: 3218, totalValue: 3813.33 },
  { partNumber: "10nF", description: "C-0805", quantity: 200, totalValue: 32.00 },
  { partNumber: "10nF 0603", description: "C-0603", quantity: 3335, totalValue: 1597.46 },
  { partNumber: "10uF 35V", description: "C-0805", quantity: 3000, totalValue: 750.00 },
  { partNumber: "220 uF 16V", description: "electrolytic capacitor radial", quantity: 800, totalValue: 2065.00 },
  { partNumber: "220 uF 35V", description: "electrolytic capacitor radial", quantity: 700, totalValue: 2065.00 },
  { partNumber: "47uF 16V", description: "electrolytic capacitor SMD", quantity: 734, totalValue: 425.72 },
  { partNumber: "220 uF 35V", description: "electrolytic capacitor radial", quantity: 0, totalValue: 0.00 },
  { partNumber: "47uF 6.3V 0805", description: "electrolytic capacitor SMD", quantity: 0, totalValue: 0.00 },
  { partNumber: "10uF-63V", description: "C-0805", quantity: 0, totalValue: 0.00 },
  { partNumber: "220uF 6.3V", description: "electrolytic capacitor SMD", quantity: 377, totalValue: 985.55 },
  { partNumber: "220uF 16V", description: "electrolytic capacitor SMD", quantity: 698, totalValue: 2862.87 },
  { partNumber: "220uF 35V", description: "electrolytic capacitor SMD", quantity: 500, totalValue: 1615.00 },
  { partNumber: "470uF 63V", description: "electrolytic capacitor SMD", quantity: 5, totalValue: 9760.00 },
  { partNumber: "10uF 10-18V T-Y", description: "TT Cap SMD", quantity: 30, totalValue: 166.02 },
  { partNumber: "6Vdc DPDT 3A", description: "Relay 6V D-P-D-T D2N V23105A53", quantity: 22, totalValue: 286.00 },
  { partNumber: "Relay 24V D-P-D-T", description: "24VDC 2 C/O 8A 240VAC", quantity: 10, totalValue: 193.40 },
  { partNumber: "Relay 12Vdc D-D-T", description: "Relay 12Vdc D-D-T", quantity: 23, totalValue: 579.14 },
  { partNumber: "Relay NT90 24V 1C", description: "24VDC 1 C/O 30A 240VAC", quantity: 14, totalValue: 257.74 },
  { partNumber: "15uH 3A inductor", description: "INDUCTOR SMD SHIELDED 15uh", quantity: 40, totalValue: 1343.60 },
  { partNumber: "CIM10U800NC Ferrite bead", description: "CIM10U800NC Ferrite bead", quantity: 2803, totalValue: 6054.48 },
  { partNumber: "4.7uH 6.8A", description: "RS inductor size 27", quantity: 0, totalValue: 0.00 },
  { partNumber: "Heatsink, 25K/W, 23 x 13 x 10mm, Solder", description: "Heatsink, 25K/W, 23 x 13 x 10mm, Solder", quantity: 10, totalValue: 445.36 },
  { partNumber: "15uH 5A", description: "VISHAY LOW PROFILE IHLP", quantity: 15, totalValue: 140.34 },
  { partNumber: "22uH 5A", description: "VISHAY LOW PROFILE IHLP", quantity: 20, totalValue: 2004.96 },
  { partNumber: "BC807", description: "N Semi BC807-25WT1G PNP Digital Transistor, 45 V, 3 Pin SC-70", quantity: 2050, totalValue: 2472.30 },
  { partNumber: "Texas Instruments CD4541BM", description: "Regulators IC and Transistors", quantity: 0, totalValue: 0.00 },
  { partNumber: "BH1620FVC-TR", description: "4541 SOIC14", quantity: 89, totalValue: 1021.76 },
  { partNumber: "50mA 5V LDO", description: "Ambient Light Sensor", quantity: 2, totalValue: 34.44 },
  { partNumber: "Microchip MCP9700T-E/TT", description: "LD2980ABM50TR 5V", quantity: 56, totalValue: 352.26 },
  { partNumber: "LT1961IMSE#PBF", description: "MCP9700T-E/TT", quantity: 125, totalValue: 755.88 },
  { partNumber: "MCP9700T-E/TT", description: "Boost regulator Analog Devices 2A", quantity: 20, totalValue: 2169.80 },
  { partNumber: "MCP9700AT-E/TT", description: "MCP9700AT-E/TT", quantity: 26, totalValue: 432.38 },
  { partNumber: "MIC5219 3.6", description: "MIC5219 3.6", quantity: 98, totalValue: 3565.24 },
  { partNumber: "Texas Instruments NE555D", description: "NE555DR RS 624661", quantity: 100, totalValue: 2063.00 },
  { partNumber: "DMP2305U-7", description: "P CHAN FET DMP2305U-7", quantity: 0, totalValue: 0.00 },
  { partNumber: "PAM2314AE", description: "PAM2314AE", quantity: 0, totalValue: 0.00 },
  { partNumber: "PIC24FJ32KA301-I/SS", description: "PIC24FJ32KA301-I/SS", quantity: 18, totalValue: 1186.38 },
  { partNumber: "Microchip BC807-25", description: "PNP-SOT23", quantity: 2439, totalValue: 998.99 },
  { partNumber: "TLP185 Photocoupler", description: "TLP185 Opto OR 10 TLP185GB", quantity: 79, totalValue: 288.94 },
  { partNumber: "TPS5430D", description: "TPS5430D", quantity: 90, totalValue: 8996.40 },
  { partNumber: "Green LED 3mm Clear", description: "LED GRN 3MM SUPERBRIGHT CLEAR", quantity: 30, totalValue: 48.60 },
  { partNumber: "Blue LED 3mm Clear", description: "BLUE 3MM 120DEG", quantity: 22, totalValue: 59.84 },
  { partNumber: "Red LED 3mm Clear", description: "LED RED 3MM SUPERBRIGHT", quantity: 42, totalValue: 59.84 },
  { partNumber: "Orange LED 3mm Clear", description: "YEL 3MM SUPERBRIGHT CLEAR", quantity: 212, totalValue: 116.60 },
  { partNumber: "Orange LED 0805", description: "LED 0805", quantity: 0, totalValue: 0.00 },
  { partNumber: "Blue LED 0805", description: "LED 0805", quantity: 3209, totalValue: 4856.69 },
  { partNumber: "GREEN LED 0805", description: "LED 0805", quantity: 3201, totalValue: 3553.11 },
  { partNumber: "YELLOW LED 0805", description: "YELLOW 120MCD 0805", quantity: 2915, totalValue: 2915.00 },
  { partNumber: "Red LED", description: "LED 0805", quantity: 1327, totalValue: 1831.26 },
  { partNumber: "4148", description: "4148 (Melf)", quantity: 293, totalValue: 58.60 },
  { partNumber: "40V 5A Schottky SS34", description: "DO-214AB (Diode)", quantity: 250, totalValue: 2102.50 },
  { partNumber: "3956 5A Schottky Diode 60V", description: "DO-214AB 3956", quantity: 473, totalValue: 1575.09 },
  { partNumber: "30V zener Diode 5% 5w axial", description: "1KV 1A SMA SMD RECT", quantity: 647, totalValue: 1777.92 },
  { partNumber: "30V zener Diode 5% 5w axial", description: "30V zener Diode 5% 5w axial", quantity: 200, totalValue: 230.00 },
  { partNumber: "30V zener melf", description: "30V zener Diode 5% 500 mW", quantity: 200, totalValue: 10070.00 },
  { partNumber: "2ZENER SMD 8v2", description: "ZEN. DIODE 8.2V 500M W SOD80C", quantity: 1790, totalValue: 930.80 },
  { partNumber: "13v", description: "ZENER MelfD", quantity: 140, totalValue: 35.00 },
  { partNumber: "4v7 ZENER MELF DIODE", description: "ZEN DIODE4.7V 500mW SOD80C", quantity: 2050, totalValue: 863.50 },
  { partNumber: "Zen Diode 5v6", description: "ZEN.DIODE 5.6V 500mW SOD80C", quantity: 1985, totalValue: 1041.45 },
  { partNumber: "10mA resettable fuse 3 Amp trip MF 300", description: "ms 3A Hold current, Radial Leaded PCB Mount Resettable Fuse, 24V", quantity: 36, totalValue: 321.91 },
  { partNumber: "POLY FUSE, MSMF110-24.X2", description: "Bourns 1.1A Surface Mount Resettable Fuse, 24V", quantity: 30, totalValue: 333.84 },
  { partNumber: "0R-0603", description: "R-0603", quantity: 3114, totalValue: 62.28 },
  { partNumber: "0R 1206", description: "R-1206", quantity: 4625, totalValue: 92.50 },
  { partNumber: "1k", description: "R-0603", quantity: 5224, totalValue: 216.01 },
  { partNumber: "1M", description: "R-0603", quantity: 1245, totalValue: 149.40 },
  { partNumber: "2k", description: "R-0603", quantity: 4235, totalValue: 279.51 },
  { partNumber: "2K2", description: "R-0603", quantity: 4323, totalValue: 605.22 },
  { partNumber: "3K3", description: "R-0603", quantity: 4200, totalValue: 126.00 },
  { partNumber: "3K3", description: "R-0603", quantity: 3208, totalValue: 96.24 },
  { partNumber: "4K7", description: "R-0603", quantity: 3395, totalValue: 101.85 },
  { partNumber: "5K6", description: "R-0603", quantity: 4100, totalValue: 656.00 },
  { partNumber: "180K", description: "R-0623-180K", quantity: 4647, totalValue: 149.74 },
  { partNumber: "10K", description: "R-0603", quantity: 3161, totalValue: 126.44 },
  { partNumber: "R-10R-0603", description: "R-0603", quantity: 2703, totalValue: 135.15 },
  { partNumber: "15K", description: "R-0603", quantity: 3164, totalValue: 125.76 },
  { partNumber: "33K", description: "33K +-5% 1/16W 0603", quantity: 4595, totalValue: 162.60 },
  { partNumber: "51K", description: "R-0603", quantity: 4789, totalValue: 1560.37 },
  { partNumber: "56K", description: "R-0603", quantity: 4789, totalValue: 3352.30 },
  { partNumber: "84.5K", description: "R-0603", quantity: 300, totalValue: 591.00 },
  { partNumber: "100K", description: "R-0603", quantity: 5000, totalValue: 200.00 },
  { partNumber: "110K", description: "R-0603", quantity: 4100, totalValue: 1312.00 },
  { partNumber: "150K", description: "R-0603", quantity: 400, totalValue: 98.10 },
  { partNumber: "220K", description: "R-0603", quantity: 4048, totalValue: 202.40 },
  { partNumber: "270K", description: "R-0603", quantity: 4440, totalValue: 88.80 },
  { partNumber: "R-470R-0603", description: "R-0603", quantity: 4526, totalValue: 135.78 },
  { partNumber: "680K", description: "R-0603", quantity: 4488, totalValue: 179.52 },
  { partNumber: "680R", description: "R-0603", quantity: 3686, totalValue: 147.44 },
  { partNumber: "0R82", description: "R-1206", quantity: 800, totalValue: 776.00 },
  { partNumber: "10R", description: "R-0805", quantity: 4263, totalValue: 596.82 },
  { partNumber: "MOVS", description: "MOVS", quantity: 0, totalValue: 0.00 },
  { partNumber: "S14K40 AUTO MOV", description: "MOV", quantity: 27, totalValue: 132.30 },
  { partNumber: "S14K420", description: "14MM MOV 420V", quantity: 60, totalValue: 246.00 },
  { partNumber: "S14K250 MOV", description: "MOV", quantity: 30, totalValue: 120.00 },
  { partNumber: "C-220uF 6.3V SMD", description: "Panasonic 220uF Polymer Capacitor", quantity: 114, totalValue: 996.36 },
  { partNumber: "INA125", description: "", quantity: 40, totalValue: 4847.20 },
  { partNumber: "533-5862", description: "LM357AN", quantity: 5, totalValue: 250.80 },
  { partNumber: "Fuel Track Led Card Rev 8", description: "PCB-LED Card Rev 8", quantity: 6, totalValue: 2184.00 },
  { partNumber: "Fuel Track Led Card Rev 8", description: "PCB-LED Card Rev 8", quantity: 5, totalValue: 551.85 },
];

// Function to determine category based on item description/part number
function determineCategory(partNumber, description) {
  const partLower = partNumber.toLowerCase();
  const descLower = description.toLowerCase();
  
  if (partLower.includes('fuse') || partLower.includes('led') || partLower.includes('diode') || 
      partLower.includes('transistor') || partLower.includes('capacitor') || partLower.includes('resistor') ||
      partLower.includes('ic') || partLower.includes('op amp') || partLower.includes('regulator') ||
      partLower.includes('sensor') || partLower.includes('switch') || partLower.includes('connector') ||
      partLower.includes('header') || partLower.includes('socket') || partLower.includes('relay') ||
      partLower.includes('inductor') || partLower.includes('zener') || partLower.includes('schottky')) {
    return 'components';
  }
  
  if (partLower.includes('enclosure') || partLower.includes('box') || partLower.includes('housing') ||
      partLower.includes('panel') || partLower.includes('gland') || partLower.includes('junction')) {
    return 'accessories';
  }
  
  if (partLower.includes('battery') || partLower.includes('power') || partLower.includes('psu')) {
    return 'accessories';
  }
  
  if (partLower.includes('screw') || partLower.includes('nut') || partLower.includes('washer') ||
      partLower.includes('spacer') || partLower.includes('tape') || partLower.includes('pipe') ||
      partLower.includes('joiner') || partLower.includes('valve')) {
    return 'accessories';
  }
  
  if (partLower.includes('completed unit') || partLower.includes('fuel track completed')) {
    return 'finished_goods';
  }
  
  return 'components'; // Default to components
}

// Function to determine type
function determineType(partNumber, description) {
  const partLower = partNumber.toLowerCase();
  const descLower = description.toLowerCase();
  
  if (partLower.includes('completed unit') || partLower.includes('finished')) {
    return 'finished_good';
  }
  
  if (partLower.includes('housing') || partLower.includes('card rev')) {
    return 'work_in_progress';
  }
  
  return 'raw_material'; // Default
}

// Main function to add items
async function addStockItems() {
  const API_BASE = process.env.API_BASE || 'http://localhost:3000';
  const token = process.env.AUTH_TOKEN || '';
  
  if (!token) {
    console.error('❌ AUTH_TOKEN environment variable is required');
    console.log('💡 You can get a token by logging into the app and checking localStorage.getItem("token")');
    process.exit(1);
  }

  console.log(`🚀 Starting to add ${stockItems.length} stock items to inventory...`);
  console.log(`📡 API Base: ${API_BASE}`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < stockItems.length; i++) {
    const item = stockItems[i];
    const unitCost = item.quantity > 0 ? item.totalValue / item.quantity : 0;
    
    const inventoryData = {
      name: item.description || item.partNumber,
      category: determineCategory(item.partNumber, item.description),
      type: determineType(item.partNumber, item.description),
      quantity: item.quantity,
      unit: 'pcs',
      unitCost: Math.round(unitCost * 100) / 100, // Round to 2 decimals
      reorderPoint: Math.max(1, Math.floor(item.quantity * 0.2)), // 20% of quantity as reorder point
      reorderQty: Math.max(10, Math.floor(item.quantity * 0.3)), // 30% of quantity as reorder qty
      location: '',
      supplier: '',
      lastRestocked: new Date().toISOString()
    };

    try {
      const response = await fetch(`${API_BASE}/api/manufacturing/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(inventoryData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ [${i + 1}/${stockItems.length}] Added: ${item.partNumber} (SKU: ${result.data?.item?.sku || 'N/A'})`);
      successCount++;
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`❌ [${i + 1}/${stockItems.length}] Failed to add ${item.partNumber}:`, error.message);
      errors.push({ item: item.partNumber, error: error.message });
      errorCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`✅ Successfully added: ${successCount} items`);
  console.log(`❌ Failed: ${errorCount} items`);
  
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(({ item, error }) => {
      console.log(`  - ${item}: ${error}`);
    });
  }
}

// Run the script
if (require.main === module) {
  addStockItems().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { addStockItems, stockItems };

