const { withAndroidManifest } = require('expo/config-plugins')

// Self-hosted servers can use HTTP on the owner's home network. The connection
// screen restricts HTTP to local addresses; public server addresses require TLS.
module.exports = function withLocalHttp(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0]
    if (application) application.$['android:usesCleartextTraffic'] = 'true'
    return result
  })
}
