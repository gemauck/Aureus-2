// WhatsApp integration utilities
const WhatsAppUtils = {
    // Generate WhatsApp message for invitation
    generateInvitationMessage(invitationData) {
        const { name, role, invitationLink, companyName = 'Abcotronics' } = invitationData;
        
        return `🎉 You've been invited to join ${companyName} ERP!

👋 Hi ${name},

You've been invited to join our ERP system with the role: ${role}

📱 To accept your invitation, click this link:
${invitationLink}

🔐 This link will expire in 7 days.

Need help? Contact us at admin@abcotronics.com

Best regards,
The ${companyName} Team`;
    },

    // Open WhatsApp Web with pre-filled message
    openWhatsAppWeb(message, phoneNumber = null) {
        const encodedMessage = encodeURIComponent(message);
        let whatsappUrl;
        
        if (phoneNumber) {
            // Send to specific number
            whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=${encodedMessage}`;
        } else {
            // Just open WhatsApp Web
            whatsappUrl = `https://web.whatsapp.com/`;
        }
        
        window.open(whatsappUrl, '_blank');
    },

    // Copy message to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    },

    // Generate QR code for WhatsApp Web (for mobile sharing)
    generateQRCode(invitationLink) {
        // This would integrate with a QR code library
        // For now, we'll just return the link
        return invitationLink;
    },

    // Format phone number for WhatsApp
    formatPhoneNumber(phoneNumber) {
        // Remove all non-digit characters
        const cleaned = phoneNumber.replace(/\D/g, '');
        
        // Add country code if not present (assuming South Africa +27)
        if (cleaned.startsWith('0')) {
            return '+27' + cleaned.substring(1);
        } else if (!cleaned.startsWith('+')) {
            return '+27' + cleaned;
        }
        
        return cleaned;
    },

    // Validate phone number
    isValidPhoneNumber(phoneNumber) {
        const cleaned = phoneNumber.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
    },

    // Generate invitation link
    generateInvitationLink(token, baseUrl = null) {
        const base = baseUrl || window.location.origin;
        return `${base}/accept-invitation?token=${token}`;
    },

    // Show WhatsApp sharing modal
    showSharingModal(invitationData) {
        const message = this.generateInvitationMessage(invitationData);
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        <i class="fab fa-whatsapp text-green-500 mr-2"></i>
                        Share Invitation
                    </h3>
                    <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="this.closest('.fixed').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="mb-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Copy this message and send it via WhatsApp:
                    </p>
                    <div class="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 mb-3">
                        <textarea readonly class="w-full bg-transparent text-sm text-gray-800 dark:text-gray-200 resize-none" rows="8">${message}</textarea>
                    </div>
                    <button onclick="window.WhatsAppUtils.copyToClipboard(this.previousElementSibling.querySelector('textarea').value); this.innerHTML='<i class=\\'fas fa-check mr-1\\'></i>Copied!'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy mr-1\\'></i>Copy Message', 2000)" class="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors">
                        <i class="fas fa-copy mr-1"></i>Copy Message
                    </button>
                </div>
                
                <div class="flex gap-3">
                    <button onclick="window.WhatsAppUtils.openWhatsAppWeb('${encodeURIComponent(message)}')" class="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center">
                        <i class="fab fa-whatsapp mr-2"></i>Open WhatsApp Web
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
};

// Make it available globally
window.WhatsAppUtils = WhatsAppUtils;
