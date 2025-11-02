const { useState, useEffect } = window;

export const ReminderSettings = ({ settings, onSave, onClose }) => {
    // Default settings
    const defaultSettings = {
        enabled: true,
        days: [7, 3, 0, 7], // Before due: 7 days, 3 days, 0 (due date), After due: 7 days
        autoSend: true,
        emailTemplate: 'default',
        includePDF: true,
        ccAccounting: false,
        servicesForEachClient: false
    };
    
    // Merge settings with defaults to ensure all fields are present
    const mergedSettings = settings ? {
        ...defaultSettings,
        ...settings,
        servicesForEachClient: settings.servicesForEachClient !== undefined ? settings.servicesForEachClient : false
    } : defaultSettings;
    
    const [formData, setFormData] = useState(mergedSettings);
    
    // Update formData when settings prop changes
    useEffect(() => {
        const merged = settings ? {
            ...defaultSettings,
            ...settings,
            servicesForEachClient: settings.servicesForEachClient !== undefined ? settings.servicesForEachClient : false
        } : defaultSettings;
        setFormData(merged);
    }, [settings]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg w-full max-w-xs sm:max-w-md md:max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-900">Payment Reminder Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Enable/Disable */}
                    <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div>
                            <div className="font-medium text-sm text-gray-900">Enable Automated Reminders</div>
                            <div className="text-xs text-gray-600 mt-0.5">
                                Automatically send payment reminders for overdue invoices
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.enabled}
                                onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>

                    {formData.enabled && (
                        <>
                            {/* Reminder Schedule */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-2">
                                    Reminder Schedule
                                </label>
                                <div className="space-y-2">
                                    <div className="p-3 border border-gray-200 rounded-lg">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="font-medium text-sm text-gray-900">
                                                <i className="fas fa-calendar-minus text-yellow-600 mr-1.5"></i>
                                                Before Due Date
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                            <label className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.days[0] > 0}
                                                    onChange={(e) => {
                                                        const newDays = [...formData.days];
                                                        newDays[0] = e.target.checked ? 7 : 0;
                                                        setFormData({...formData, days: newDays});
                                                    }}
                                                    className="mr-2 w-3.5 h-3.5"
                                                />
                                                <span className="text-xs">7 days before</span>
                                            </label>
                                            <label className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.days[1] > 0}
                                                    onChange={(e) => {
                                                        const newDays = [...formData.days];
                                                        newDays[1] = e.target.checked ? 3 : 0;
                                                        setFormData({...formData, days: newDays});
                                                    }}
                                                    className="mr-2 w-3.5 h-3.5"
                                                />
                                                <span className="text-xs">3 days before</span>
                                            </label>
                                            <label className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.days[2] >= 0}
                                                    onChange={(e) => {
                                                        const newDays = [...formData.days];
                                                        newDays[2] = e.target.checked ? 0 : -1;
                                                        setFormData({...formData, days: newDays});
                                                    }}
                                                    className="mr-2 w-3.5 h-3.5"
                                                />
                                                <span className="text-xs">On due date</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="p-3 border border-red-200 rounded-lg bg-red-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="font-medium text-sm text-gray-900">
                                                <i className="fas fa-exclamation-triangle text-red-600 mr-1.5"></i>
                                                After Due Date (Overdue)
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                            <label className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.days[3] > 0}
                                                    onChange={(e) => {
                                                        const newDays = [...formData.days];
                                                        newDays[3] = e.target.checked ? 7 : 0;
                                                        setFormData({...formData, days: newDays});
                                                    }}
                                                    className="mr-2 w-3.5 h-3.5"
                                                />
                                                <span className="text-xs">7 days after</span>
                                            </label>
                                            <label className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    disabled
                                                    className="mr-2 w-3.5 h-3.5"
                                                />
                                                <span className="text-xs text-gray-400">14 days after (Soon)</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Settings */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-2">
                                    Additional Options
                                </label>
                                <div className="space-y-2">
                                    <label className="flex items-center p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.autoSend}
                                            onChange={(e) => setFormData({...formData, autoSend: e.target.checked})}
                                            className="mr-2.5 w-3.5 h-3.5"
                                        />
                                        <div>
                                            <div className="font-medium text-xs text-gray-900">Auto-send reminders</div>
                                            <div className="text-[10px] text-gray-600">
                                                Send reminders automatically without manual approval
                                            </div>
                                        </div>
                                    </label>

                                    <label className="flex items-center p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.includePDF}
                                            onChange={(e) => setFormData({...formData, includePDF: e.target.checked})}
                                            className="mr-2.5 w-3.5 h-3.5"
                                        />
                                        <div>
                                            <div className="font-medium text-xs text-gray-900">Include PDF attachment</div>
                                            <div className="text-[10px] text-gray-600">
                                                Attach invoice PDF to reminder emails
                                            </div>
                                        </div>
                                    </label>

                                    <label className="flex items-center p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.ccAccounting}
                                            onChange={(e) => setFormData({...formData, ccAccounting: e.target.checked})}
                                            className="mr-2.5 w-3.5 h-3.5"
                                        />
                                        <div>
                                            <div className="font-medium text-xs text-gray-900">CC accounting team</div>
                                            <div className="text-[10px] text-gray-600">
                                                Copy accounting@abcotronics.co.za on all reminders
                                            </div>
                                        </div>
                                    </label>

                                    <label className="flex items-center p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.servicesForEachClient || false}
                                            onChange={(e) => setFormData({...formData, servicesForEachClient: e.target.checked})}
                                            className="mr-2.5 w-3.5 h-3.5"
                                        />
                                        <div>
                                            <div className="font-medium text-xs text-gray-900">Services for each Client</div>
                                            <div className="text-[10px] text-gray-600">
                                                Group and display services separately for each client in reminders
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Email Template */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Email Template
                                </label>
                                <select
                                    value={formData.emailTemplate}
                                    onChange={(e) => setFormData({...formData, emailTemplate: e.target.value})}
                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                >
                                    <option value="default">Default - Professional</option>
                                    <option value="friendly">Friendly Reminder</option>
                                    <option value="formal">Formal Notice</option>
                                    <option value="urgent">Urgent - Overdue</option>
                                </select>
                            </div>

                            {/* Preview */}
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="text-xs font-medium text-gray-700 mb-1.5">Preview</div>
                                <div className="text-xs text-gray-600 space-y-1.5">
                                    <p><strong>Subject:</strong> Payment Reminder - Invoice #{'{'}invoiceNumber{'}'}</p>
                                    <p className="italic text-[10px]">
                                        Dear {'{'}clientName{'}'},<br /><br />
                                        This is a friendly reminder that invoice #{'{'}invoiceNumber{'}'} for R{'{'}amount{'}'} 
                                        {formData.days[3] > 0 ? ' is now overdue.' : ' will be due soon.'}<br /><br />
                                        Please remit payment at your earliest convenience.<br /><br />
                                        Best regards,<br />
                                        Abcotronics Team
                                    </p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                            <i className="fas fa-save mr-1.5"></i>
                            Save Settings
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReminderSettings;
