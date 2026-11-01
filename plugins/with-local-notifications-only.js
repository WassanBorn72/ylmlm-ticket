const { withEntitlementsPlist } = require('expo/config-plugins');

// Local notification scheduling does not use APNs. Keep personal iOS builds
// free of the Push Notifications entitlement added by expo-notifications.
module.exports = config => withEntitlementsPlist(config, config => {
  delete config.modResults['aps-environment'];
  return config;
});
