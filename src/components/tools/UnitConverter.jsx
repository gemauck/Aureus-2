// Use React from window
const { useState, useEffect } = React;

const UnitConverter = () => {
    const [category, setCategory] = useState('length');
    const [fromUnit, setFromUnit] = useState('');
    const [toUnit, setToUnit] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [result, setResult] = useState('');

    const categories = {
        length: {
            name: 'Length',
            icon: 'fa-ruler',
            units: {
                // Metric
                'mm': { name: 'Millimeters', toBase: 0.001 },
                'cm': { name: 'Centimeters', toBase: 0.01 },
                'm': { name: 'Meters', toBase: 1 },
                'km': { name: 'Kilometers', toBase: 1000 },
                // Imperial
                'in': { name: 'Inches', toBase: 0.0254 },
                'ft': { name: 'Feet', toBase: 0.3048 },
                'yd': { name: 'Yards', toBase: 0.9144 },
                'mi': { name: 'Miles', toBase: 1609.34 },
                // Nautical
                'nmi': { name: 'Nautical Miles', toBase: 1852 }
            }
        },
        weight: {
            name: 'Weight / Mass',
            icon: 'fa-weight',
            units: {
                // Metric
                'mg': { name: 'Milligrams', toBase: 0.000001 },
                'g': { name: 'Grams', toBase: 0.001 },
                'kg': { name: 'Kilograms', toBase: 1 },
                'ton': { name: 'Metric Tons', toBase: 1000 },
                // Imperial
                'oz': { name: 'Ounces', toBase: 0.0283495 },
                'lb': { name: 'Pounds', toBase: 0.453592 },
                'st': { name: 'Stone', toBase: 6.35029 },
                'ton_us': { name: 'US Tons', toBase: 907.185 },
                'ton_uk': { name: 'UK Tons', toBase: 1016.05 }
            }
        },
        temperature: {
            name: 'Temperature',
            icon: 'fa-thermometer-half',
            special: true,
            units: {
                'c': { name: 'Celsius (°C)' },
                'f': { name: 'Fahrenheit (°F)' },
                'k': { name: 'Kelvin (K)' }
            }
        },
        volume: {
            name: 'Volume',
            icon: 'fa-flask',
            units: {
                // Metric
                'ml': { name: 'Milliliters', toBase: 0.001 },
                'l': { name: 'Liters', toBase: 1 },
                'kl': { name: 'Kiloliters', toBase: 1000 },
                'm3': { name: 'Cubic Meters', toBase: 1000 },
                // Imperial
                'tsp': { name: 'Teaspoons', toBase: 0.00492892 },
                'tbsp': { name: 'Tablespoons', toBase: 0.0147868 },
                'floz': { name: 'Fluid Ounces', toBase: 0.0295735 },
                'cup': { name: 'Cups', toBase: 0.236588 },
                'pt': { name: 'Pints', toBase: 0.473176 },
                'qt': { name: 'Quarts', toBase: 0.946353 },
                'gal': { name: 'Gallons', toBase: 3.78541 },
                'ft3': { name: 'Cubic Feet', toBase: 28.3168 }
            }
        },
        area: {
            name: 'Area',
            icon: 'fa-expand',
            units: {
                // Metric
                'mm2': { name: 'Square Millimeters', toBase: 0.000001 },
                'cm2': { name: 'Square Centimeters', toBase: 0.0001 },
                'm2': { name: 'Square Meters', toBase: 1 },
                'ha': { name: 'Hectares', toBase: 10000 },
                'km2': { name: 'Square Kilometers', toBase: 1000000 },
                // Imperial
                'in2': { name: 'Square Inches', toBase: 0.00064516 },
                'ft2': { name: 'Square Feet', toBase: 0.092903 },
                'yd2': { name: 'Square Yards', toBase: 0.836127 },
                'ac': { name: 'Acres', toBase: 4046.86 },
                'mi2': { name: 'Square Miles', toBase: 2589988.11 }
            }
        },
        speed: {
            name: 'Speed',
            icon: 'fa-tachometer-alt',
            units: {
                'mps': { name: 'Meters/Second', toBase: 1 },
                'kph': { name: 'Kilometers/Hour', toBase: 0.277778 },
                'mph': { name: 'Miles/Hour', toBase: 0.44704 },
                'fps': { name: 'Feet/Second', toBase: 0.3048 },
                'knot': { name: 'Knots', toBase: 0.514444 },
                'mach': { name: 'Mach', toBase: 343 }
            }
        },
        time: {
            name: 'Time',
            icon: 'fa-clock',
            units: {
                'ms': { name: 'Milliseconds', toBase: 0.001 },
                's': { name: 'Seconds', toBase: 1 },
                'min': { name: 'Minutes', toBase: 60 },
                'hr': { name: 'Hours', toBase: 3600 },
                'day': { name: 'Days', toBase: 86400 },
                'wk': { name: 'Weeks', toBase: 604800 },
                'mo': { name: 'Months (30 days)', toBase: 2592000 },
                'yr': { name: 'Years (365 days)', toBase: 31536000 }
            }
        },
        data: {
            name: 'Digital Storage',
            icon: 'fa-hdd',
            units: {
                'b': { name: 'Bits', toBase: 1 },
                'B': { name: 'Bytes', toBase: 8 },
                'KB': { name: 'Kilobytes', toBase: 8000 },
                'MB': { name: 'Megabytes', toBase: 8000000 },
                'GB': { name: 'Gigabytes', toBase: 8000000000 },
                'TB': { name: 'Terabytes', toBase: 8000000000000 },
                'KiB': { name: 'Kibibytes', toBase: 8192 },
                'MiB': { name: 'Mebibytes', toBase: 8388608 },
                'GiB': { name: 'Gibibytes', toBase: 8589934592 },
                'TiB': { name: 'Tebibytes', toBase: 8796093022208 }
            }
        },
        pressure: {
            name: 'Pressure',
            icon: 'fa-compress-arrows-alt',
            units: {
                'pa': { name: 'Pascal', toBase: 1 },
                'kpa': { name: 'Kilopascal', toBase: 1000 },
                'bar': { name: 'Bar', toBase: 100000 },
                'mbar': { name: 'Millibar', toBase: 100 },
                'atm': { name: 'Atmosphere', toBase: 101325 },
                'psi': { name: 'PSI', toBase: 6894.76 },
                'torr': { name: 'Torr', toBase: 133.322 }
            }
        },
        energy: {
            name: 'Energy',
            icon: 'fa-bolt',
            units: {
                'j': { name: 'Joules', toBase: 1 },
                'kj': { name: 'Kilojoules', toBase: 1000 },
                'cal': { name: 'Calories', toBase: 4.184 },
                'kcal': { name: 'Kilocalories', toBase: 4184 },
                'wh': { name: 'Watt-hours', toBase: 3600 },
                'kwh': { name: 'Kilowatt-hours', toBase: 3600000 },
                'btu': { name: 'BTU', toBase: 1055.06 }
            }
        }
    };

    // Initialize default units when category changes
    useEffect(() => {
        const units = Object.keys(categories[category].units);
        setFromUnit(units[0] || '');
        setToUnit(units[1] || units[0] || '');
        setInputValue('');
        setResult('');
    }, [category]);

    // Perform conversion
    useEffect(() => {
        if (!inputValue || !fromUnit || !toUnit || isNaN(inputValue)) {
            setResult('');
            return;
        }

        const value = parseFloat(inputValue);
        let converted;

        if (category === 'temperature') {
            converted = convertTemperature(value, fromUnit, toUnit);
        } else {
            const fromBase = categories[category].units[fromUnit].toBase;
            const toBase = categories[category].units[toUnit].toBase;
            converted = (value * fromBase) / toBase;
        }

        // Format result
        if (Math.abs(converted) < 0.0001 || Math.abs(converted) > 999999) {
            setResult(converted.toExponential(6));
        } else {
            setResult(converted.toFixed(8).replace(/\.?0+$/, ''));
        }
    }, [inputValue, fromUnit, toUnit, category]);

    const convertTemperature = (value, from, to) => {
        // Convert to Celsius first
        let celsius;
        if (from === 'c') celsius = value;
        else if (from === 'f') celsius = (value - 32) * 5/9;
        else if (from === 'k') celsius = value - 273.15;

        // Convert from Celsius to target
        if (to === 'c') return celsius;
        else if (to === 'f') return celsius * 9/5 + 32;
        else if (to === 'k') return celsius + 273.15;
    };

    const swapUnits = () => {
        const temp = fromUnit;
        setFromUnit(toUnit);
        setToUnit(temp);
        if (result) {
            setInputValue(result);
        }
    };

    const clearAll = () => {
        setInputValue('');
        setResult('');
    };

    return (
        <div className="space-y-3">
            {/* Category Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Select Category</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {Object.entries(categories).map(([key, cat]) => (
                        <button
                            key={key}
                            onClick={() => setCategory(key)}
                            className={`p-2.5 rounded-lg border-2 transition-all text-center ${
                                category === key
                                    ? 'border-primary-500 bg-primary-50'
                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                        >
                            <i className={`fas ${cat.icon} text-base ${
                                category === key ? 'text-primary-600' : 'text-gray-400'
                            } mb-1`}></i>
                            <p className={`text-[10px] font-medium ${
                                category === key ? 'text-primary-900' : 'text-gray-700'
                            }`}>{cat.name}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Conversion Interface */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* From */}
                    <div>
                        <label className="text-xs font-medium text-gray-700 mb-1.5 block">From</label>
                        <select
                            value={fromUnit}
                            onChange={(e) => setFromUnit(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-2"
                        >
                            {Object.entries(categories[category].units).map(([key, unit]) => (
                                <option key={key} value={key}>{unit.name}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Enter value"
                            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                        />
                    </div>

                    {/* Swap Button */}
                    <div className="hidden md:flex items-center justify-center">
                        <button
                            onClick={swapUnits}
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Swap units"
                        >
                            <i className="fas fa-exchange-alt text-lg"></i>
                        </button>
                    </div>

                    {/* To */}
                    <div>
                        <label className="text-xs font-medium text-gray-700 mb-1.5 block">To</label>
                        <select
                            value={toUnit}
                            onChange={(e) => setToUnit(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-2"
                        >
                            {Object.entries(categories[category].units).map(([key, unit]) => (
                                <option key={key} value={key}>{unit.name}</option>
                            ))}
                        </select>
                        <div className="relative">
                            <input
                                type="text"
                                value={result}
                                readOnly
                                placeholder="Result"
                                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-gray-50 font-mono font-semibold text-primary-600"
                            />
                            {result && (
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(result);
                                        alert('Result copied to clipboard!');
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors"
                                    title="Copy result"
                                >
                                    <i className="fas fa-copy text-xs"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Swap button for mobile */}
                <div className="md:hidden mt-3 flex justify-center">
                    <button
                        onClick={swapUnits}
                        className="px-4 py-2 text-xs text-primary-600 hover:bg-primary-50 rounded-lg transition-colors border border-primary-200"
                    >
                        <i className="fas fa-exchange-alt mr-1.5"></i>
                        Swap Units
                    </button>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center justify-between">
                    <button
                        onClick={clearAll}
                        className="text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 hover:bg-gray-100 rounded transition-colors"
                    >
                        <i className="fas fa-redo mr-1"></i>
                        Clear
                    </button>
                    {result && (
                        <div className="text-[10px] text-gray-500">
                            {inputValue} {categories[category].units[fromUnit].name} = {result} {categories[category].units[toUnit].name}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Reference Table */}
            {inputValue && result && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Common Conversions</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.entries(categories[category].units).slice(0, 6).map(([key, unit]) => {
                            let converted;
                            const value = parseFloat(inputValue);
                            
                            if (category === 'temperature') {
                                converted = convertTemperature(value, fromUnit, key);
                            } else {
                                const fromBase = categories[category].units[fromUnit].toBase;
                                const toBase = unit.toBase;
                                converted = (value * fromBase) / toBase;
                            }

                            const formatted = Math.abs(converted) < 0.0001 || Math.abs(converted) > 999999
                                ? converted.toExponential(4)
                                : converted.toFixed(4).replace(/\.?0+$/, '');

                            return (
                                <div key={key} className="bg-gray-50 rounded p-2 border border-gray-200">
                                    <p className="text-[10px] text-gray-600 mb-0.5">{unit.name}</p>
                                    <p className="text-xs font-semibold text-gray-900 font-mono">{formatted}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Info Panel */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start">
                    <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                    <div>
                        <p className="text-xs font-medium text-blue-900 mb-1">How to use</p>
                        <ul className="text-xs text-blue-800 space-y-0.5 list-disc list-inside">
                            <li>Select a category (length, weight, temperature, etc.)</li>
                            <li>Choose the units you want to convert from and to</li>
                            <li>Enter a value and see instant conversion</li>
                            <li>Use the swap button to reverse the conversion direction</li>
                            <li>Click the copy icon to copy the result</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.UnitConverter = UnitConverter;
