const { AndroidConfig, createRunOncePlugin } = require('expo/config-plugins');

// expo-contacts unconditionally requests both READ_CONTACTS and WRITE_CONTACTS.
// This app only ever reads contacts (ContactPickerModal's "From Phone" import),
// so block WRITE_CONTACTS from reaching the compiled AndroidManifest.xml.
const withoutContactsWrite = (config) => {
  return AndroidConfig.Permissions.withBlockedPermissions(config, [
    'android.permission.WRITE_CONTACTS',
  ]);
};

module.exports = createRunOncePlugin(withoutContactsWrite, 'withoutContactsWrite', '1.0.0');
