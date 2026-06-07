/**
 * Full-screen Messages for pop-out / dedicated window at /messages (no ERP sidebar).
 */
function MessagesStandalone() {
  const { isDark } = window.useTheme?.() || { isDark: false };
  const Chat = window.Messenger;

  if (!Chat) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-gray-950' : 'bg-gray-100'}`}>
        <div className="text-center px-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading Messages…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-[#0b1220] text-gray-100' : 'bg-[#f0f4f8] text-gray-900'}`}>
      <div className="flex-1 p-1 sm:p-2">
        <Chat standalone />
      </div>
    </div>
  );
}

window.MessagesStandalone = MessagesStandalone;

export default MessagesStandalone;
